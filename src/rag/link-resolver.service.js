const {
  ClientWhatsappLink,
  ProjectWhatsappLink,
  Project,
} = require("../models");
const {
  jidToPhoneDigits,
  isGroupJid,
  normalizeGroupExternalId,
  normalizePhoneDigits,
} = require("./phone-normalizer");

async function resolveContextFromJid(tenantId, remoteJid) {
  const result = {
    client_id: null,
    project_id: null,
    client_ids: [],
    project_ids: [],
  };

  if (!tenantId || !remoteJid) return result;

  if (isGroupJid(remoteJid)) {
    const groupId = normalizeGroupExternalId(remoteJid);
    const groupLinks = await ProjectWhatsappLink.findAll({
      where: {
        tenant_id: tenantId,
        link_type: "group",
        external_id: groupId,
      },
      attributes: ["project_id", "id"],
    });

    result.project_ids = groupLinks.map((item) => item.project_id);
    if (result.project_ids.length === 1) {
      result.project_id = result.project_ids[0];
      const project = await Project.findByPk(result.project_id, {
        attributes: ["client_id"],
      });
      if (project?.client_id) {
        result.client_id = project.client_id;
        result.client_ids = [project.client_id];
      }
    }

    return result;
  }

  const phoneDigits = jidToPhoneDigits(remoteJid);
  if (!phoneDigits) return result;

  const clientLinks = await ClientWhatsappLink.findAll({
    where: { tenant_id: tenantId, phone_digits: phoneDigits },
    attributes: ["client_id", "id"],
  });

  result.client_ids = clientLinks.map((item) => item.client_id);
  if (result.client_ids.length === 1) {
    result.client_id = result.client_ids[0];
  }

  const phoneLinks = await ProjectWhatsappLink.findAll({
    where: {
      tenant_id: tenantId,
      link_type: "phone",
      external_id: phoneDigits,
    },
    attributes: ["project_id", "id"],
  });

  result.project_ids = phoneLinks.map((item) => item.project_id);
  if (result.project_ids.length === 1) {
    result.project_id = result.project_ids[0];
    if (!result.client_id) {
      const project = await Project.findByPk(result.project_id, {
        attributes: ["client_id"],
      });
      if (project?.client_id) {
        result.client_id = project.client_id;
        if (!result.client_ids.includes(project.client_id)) {
          result.client_ids.push(project.client_id);
        }
      }
    }
  }

  return result;
}

async function listClientLinks(tenantId, clientId) {
  return ClientWhatsappLink.findAll({
    where: { tenant_id: tenantId, client_id: clientId },
    order: [
      ["is_primary", "DESC"],
      ["created_at", "ASC"],
    ],
  });
}

async function listProjectLinks(tenantId, projectId) {
  return ProjectWhatsappLink.findAll({
    where: { tenant_id: tenantId, project_id: projectId },
    order: [["created_at", "ASC"]],
  });
}

async function upsertClientLink(tenantId, clientId, payload) {
  const phoneDigits = normalizePhoneDigits(payload.phone || payload.phone_digits);
  if (!phoneDigits) {
    throw new Error("Telefone inválido");
  }

  const [link] = await ClientWhatsappLink.findOrCreate({
    where: { tenant_id: tenantId, client_id: clientId, phone_digits: phoneDigits },
    defaults: {
      tenant_id: tenantId,
      client_id: clientId,
      phone_digits: phoneDigits,
      phone_e164: payload.phone_e164 || `+${phoneDigits}`,
      label: payload.label || null,
      is_primary: Boolean(payload.is_primary),
      whatsapp_jid: payload.whatsapp_jid || `${phoneDigits}@s.whatsapp.net`,
      metadata: payload.metadata || {},
    },
  });

  if (payload.label !== undefined || payload.is_primary !== undefined) {
    await link.update({
      label: payload.label ?? link.label,
      is_primary: payload.is_primary ?? link.is_primary,
      phone_e164: payload.phone_e164 || link.phone_e164,
      whatsapp_jid: payload.whatsapp_jid || link.whatsapp_jid,
      metadata: payload.metadata || link.metadata,
    });
  }

  if (payload.is_primary) {
    const { Op } = require("sequelize");
    await ClientWhatsappLink.update(
      { is_primary: false },
      {
        where: {
          tenant_id: tenantId,
          client_id: clientId,
          id: { [Op.ne]: link.id },
        },
      }
    );
  }

  return link;
}

async function upsertProjectLink(tenantId, projectId, payload) {
  const linkType = payload.link_type;
  if (!["phone", "group"].includes(linkType)) {
    throw new Error("link_type deve ser phone ou group");
  }

  let externalId = payload.external_id;
  let whatsappJid = payload.whatsapp_jid || null;

  if (linkType === "phone") {
    externalId = normalizePhoneDigits(payload.phone || payload.external_id);
    whatsappJid = whatsappJid || `${externalId}@s.whatsapp.net`;
  } else {
    externalId = normalizeGroupExternalId(payload.external_id || payload.whatsapp_jid);
    whatsappJid = payload.whatsapp_jid || `${externalId}@g.us`;
  }

  if (!externalId) throw new Error("Identificador externo inválido");

  const [link] = await ProjectWhatsappLink.findOrCreate({
    where: {
      tenant_id: tenantId,
      project_id: projectId,
      link_type: linkType,
      external_id: externalId,
    },
    defaults: {
      tenant_id: tenantId,
      project_id: projectId,
      link_type: linkType,
      external_id: externalId,
      display_name: payload.display_name || null,
      whatsapp_jid: whatsappJid,
      metadata: payload.metadata || {},
    },
  });

  if (payload.display_name !== undefined || payload.metadata) {
    await link.update({
      display_name: payload.display_name ?? link.display_name,
      whatsapp_jid: whatsappJid || link.whatsapp_jid,
      metadata: payload.metadata || link.metadata,
    });
  }

  return link;
}

async function ensureProjectClientPhoneLink(tenantId, projectId) {
  const project = await Project.findByPk(projectId, { attributes: ["id", "client_id", "name"] });
  if (!project?.client_id) return null;

  const existingPhone = await ProjectWhatsappLink.findOne({
    where: { tenant_id: tenantId, project_id: projectId, link_type: "phone" },
  });
  if (existingPhone) return existingPhone;

  const clientLinks = await ClientWhatsappLink.findAll({
    where: { tenant_id: tenantId, client_id: project.client_id },
    order: [
      ["is_primary", "DESC"],
      ["created_at", "ASC"],
    ],
  });

  const primary = clientLinks.find((item) => item.is_primary) || clientLinks[0];
  if (!primary) return null;

  return upsertProjectLink(tenantId, projectId, {
    link_type: "phone",
    phone: primary.phone_digits,
    display_name: primary.label || "Cliente",
    metadata: {
      inherited_from_client: true,
      client_link_id: primary.id,
    },
  });
}

module.exports = {
  resolveContextFromJid,
  listClientLinks,
  listProjectLinks,
  upsertClientLink,
  upsertProjectLink,
  ensureProjectClientPhoneLink,
};
