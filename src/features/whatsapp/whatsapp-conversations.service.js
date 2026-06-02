const { Op } = require("sequelize");
const AppError = require("../../utils/app-error");
const {
  RagConversation,
  RagMessage,
  ClientWhatsappLink,
  ProjectWhatsappLink,
} = require("../../models");
const {
  phoneToWhatsappJid,
} = require("../../rag/phone-normalizer");
const linkResolver = require("../../rag/link-resolver.service");

function mapLinkToThreadMeta(link, { scope }) {
  if (scope === "client") {
    const jid = link.whatsapp_jid || phoneToWhatsappJid(link.phone_digits);
    return {
      link_id: link.id,
      link_type: "phone",
      jid,
      label: link.label || null,
      display: link.label || link.phone_digits,
      phone_digits: link.phone_digits,
      is_primary: Boolean(link.is_primary),
    };
  }

  const jid =
    link.whatsapp_jid ||
    (link.link_type === "group"
      ? `${link.external_id}@g.us`
      : phoneToWhatsappJid(link.external_id));

  return {
    link_id: link.id,
    link_type: link.link_type,
    jid,
    label: link.display_name || null,
    display:
      link.display_name ||
      (link.link_type === "group" ? "Grupo WhatsApp" : link.external_id),
    external_id: link.external_id,
    inherited: Boolean(link.metadata?.inherited_from_client),
  };
}

async function reconcileConversationsForJids(tenantId, jids, { clientId, projectId }) {
  if (!jids.length) return;

  const updates = {};
  if (clientId) updates.client_id = clientId;
  if (projectId) updates.project_id = projectId;

  if (!Object.keys(updates).length) return;

  await RagConversation.update(updates, {
    where: {
      tenant_id: tenantId,
      channel: "whatsapp",
      external_thread_id: { [Op.in]: jids },
      [Op.or]: [
        clientId ? { client_id: null } : null,
        projectId ? { project_id: null } : null,
      ].filter(Boolean),
    },
  });
}

async function findConversationsByJids(tenantId, jids) {
  if (!jids.length) return new Map();

  const conversations = await RagConversation.findAll({
    where: {
      tenant_id: tenantId,
      channel: "whatsapp",
      external_thread_id: { [Op.in]: jids },
    },
  });

  return new Map(conversations.map((item) => [item.external_thread_id, item]));
}

async function attachLatestPreviews(conversations) {
  const ids = conversations.filter(Boolean).map((item) => item.id);
  if (!ids.length) return new Map();

  const previews = new Map();

  await Promise.all(
    ids.map(async (conversationId) => {
      const message = await RagMessage.findOne({
        where: { conversation_id: conversationId },
        order: [["sent_at", "DESC"]],
        attributes: [
          "id",
          "conversation_id",
          "body_text",
          "content_type",
          "direction",
          "sent_at",
          "sender_name",
        ],
      });

      if (message) {
        previews.set(conversationId, {
          id: message.id,
          body_text: message.body_text,
          content_type: message.content_type,
          direction: message.direction,
          sent_at: message.sent_at,
          sender_name: message.sender_name,
        });
      }
    })
  );

  return previews;
}

function serializeConversation(conversation, preview) {
  if (!conversation) {
    return {
      id: null,
      message_count: 0,
      last_message_at: null,
      participant_label: null,
      is_group: false,
      last_message: null,
    };
  }

  return {
    id: conversation.id,
    message_count: conversation.message_count || 0,
    last_message_at: conversation.last_message_at,
    participant_label: conversation.participant_label,
    is_group: Boolean(conversation.is_group),
    title: conversation.title,
    last_message: preview || null,
  };
}

async function listClientThreads(clientId, ctx) {
  const links = await linkResolver.listClientLinks(ctx.tenantId, clientId);
  const threadMetas = links.map((link) => mapLinkToThreadMeta(link, { scope: "client" }));
  const jids = [...new Set(threadMetas.map((item) => item.jid).filter(Boolean))];

  await reconcileConversationsForJids(ctx.tenantId, jids, { clientId });

  const conversationMap = await findConversationsByJids(ctx.tenantId, jids);
  const previews = await attachLatestPreviews([...conversationMap.values()]);

  return threadMetas.map((meta) => {
    const conversation = conversationMap.get(meta.jid) || null;
    const preview = conversation ? previews.get(conversation.id) : null;

    return {
      ...meta,
      conversation: serializeConversation(conversation, preview),
    };
  });
}

async function listProjectThreads(projectId, ctx) {
  await linkResolver.ensureProjectClientPhoneLink(ctx.tenantId, projectId);
  const links = await linkResolver.listProjectLinks(ctx.tenantId, projectId);
  const threadMetas = links.map((link) => mapLinkToThreadMeta(link, { scope: "project" }));
  const jids = [...new Set(threadMetas.map((item) => item.jid).filter(Boolean))];

  await reconcileConversationsForJids(ctx.tenantId, jids, { projectId });

  const conversationMap = await findConversationsByJids(ctx.tenantId, jids);
  const previews = await attachLatestPreviews([...conversationMap.values()]);

  return threadMetas.map((meta) => {
    const conversation = conversationMap.get(meta.jid) || null;
    const preview = conversation ? previews.get(conversation.id) : null;

    return {
      ...meta,
      conversation: serializeConversation(conversation, preview),
    };
  });
}

async function assertConversationAccess(conversationId, ctx, { clientId, projectId } = {}) {
  const conversation = await RagConversation.findOne({
    where: { id: conversationId, tenant_id: ctx.tenantId },
  });

  if (!conversation) {
    throw new AppError("Conversa não encontrada", 404);
  }

  if (clientId) {
    const links = await ClientWhatsappLink.findAll({
      where: { tenant_id: ctx.tenantId, client_id: clientId },
    });
    const jids = links
      .map((link) => link.whatsapp_jid || phoneToWhatsappJid(link.phone_digits))
      .filter(Boolean);

    const allowed =
      conversation.client_id === clientId ||
      jids.includes(conversation.external_thread_id);

    if (!allowed) {
      throw new AppError("Conversa não pertence a este cliente", 403);
    }
  }

  if (projectId) {
    const links = await ProjectWhatsappLink.findAll({
      where: { tenant_id: ctx.tenantId, project_id: projectId },
    });
    const jids = links
      .map((link) => {
        if (link.whatsapp_jid) return link.whatsapp_jid;
        if (link.link_type === "group") return `${link.external_id}@g.us`;
        return phoneToWhatsappJid(link.external_id);
      })
      .filter(Boolean);

    const allowed =
      conversation.project_id === projectId ||
      jids.includes(conversation.external_thread_id);

    if (!allowed) {
      throw new AppError("Conversa não pertence a este projeto", 403);
    }
  }

  return conversation;
}

async function listConversationMessages(conversationId, ctx, options = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 100);
  const before = options.before ? new Date(options.before) : null;

  await assertConversationAccess(conversationId, ctx, {
    clientId: options.clientId,
    projectId: options.projectId,
  });

  const where = {
    tenant_id: ctx.tenantId,
    conversation_id: conversationId,
  };

  if (before && !Number.isNaN(before.getTime())) {
    where.sent_at = { [Op.lt]: before };
  }

  const messages = await RagMessage.findAll({
    where,
    order: [["sent_at", "DESC"]],
    limit: limit + 1,
    attributes: [
      "id",
      "direction",
      "sender_id",
      "sender_name",
      "content_type",
      "body_text",
      "sent_at",
      "metadata",
    ],
  });

  const hasMore = messages.length > limit;
  const items = hasMore ? messages.slice(0, limit) : messages;

  return {
    items: items.reverse(),
    has_more: hasMore,
    next_before: hasMore ? items[0]?.sent_at : null,
  };
}

module.exports = {
  listClientThreads,
  listProjectThreads,
  listConversationMessages,
  assertConversationAccess,
};
