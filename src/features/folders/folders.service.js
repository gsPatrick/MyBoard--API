const { Op } = require("sequelize");
const { WorkspaceFolder, Project, Client } = require("../../models");
const AppError = require("../../utils/app-error");
const { slugify } = require("../../utils/crypto");
const notificationsService = require("../notifications/notifications.service");
const { NOTIFICATION_EVENTS } = require("../../config/constants");
const {
  applyTenantFilter,
  resolveTenantIdForWrite,
  assertResourceTenant,
} = require("../../utils/request-context");

function applyVisibility(where, query = {}, ctx) {
  applyTenantFilter(where, ctx);
  if (query.include_hidden !== "true") {
    where.is_hidden = false;
  }
  if (query.include_inactive !== "true") {
    where.is_active = true;
  }
  return where;
}

async function ensureUniqueFolderSlug({ parentId, clientId, baseSlug, excludeId = null }) {
  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const where = {
      parent_id: parentId || null,
      client_id: clientId || null,
      slug,
    };
    if (excludeId) where.id = { [Op.ne]: excludeId };

    const existing = await WorkspaceFolder.findOne({ where });
    if (!existing) return slug;

    slug = `${baseSlug}-${counter}`;
    counter += 1;
  }
}

async function isDescendant(folderId, potentialParentId) {
  let currentId = potentialParentId;

  while (currentId) {
    if (currentId === folderId) return true;
    const folder = await WorkspaceFolder.findByPk(currentId, { attributes: ["parent_id"] });
    if (!folder) break;
    currentId = folder.parent_id;
  }

  return false;
}

async function listFolders(query = {}, ctx) {
  const where = applyVisibility({}, query, ctx);

  if (query.client_id) where.client_id = query.client_id;
  if (query.parent_id === "null" || query.parent_id === null) {
    where.parent_id = null;
  } else if (query.parent_id) {
    where.parent_id = query.parent_id;
  }

  return WorkspaceFolder.findAll({
    where,
    order: [
      ["sort_order", "ASC"],
      ["name", "ASC"],
    ],
  });
}

async function getFolderContents(folderId, query = {}, ctx) {
  const folder = await WorkspaceFolder.findByPk(folderId);
  assertResourceTenant(folder, ctx, "FOLDER_NOT_FOUND");

  const folderWhere = applyVisibility({ parent_id: folderId }, query, ctx);
  const projectWhere = applyVisibility({ folder_id: folderId }, query, ctx);

  const [subfolders, projects] = await Promise.all([
    WorkspaceFolder.findAll({
      where: folderWhere,
      order: [
        ["sort_order", "ASC"],
        ["name", "ASC"],
      ],
    }),
    Project.findAll({
      where: projectWhere,
      include: [{ model: Client, as: "client", attributes: ["id", "name"] }],
      order: [
        ["importance_level", "DESC"],
        ["name", "ASC"],
      ],
    }),
  ]);

  return {
    folder,
    type: "directory",
    children: {
      folders: subfolders.map((f) => ({ ...f.toJSON(), itemType: "folder" })),
      projects: projects.map((p) => ({ ...p.toJSON(), itemType: "file" })),
    },
  };
}

async function getWorkspaceTree(query = {}, ctx) {
  const rootWhere = applyVisibility(
    {
      parent_id: null,
      ...(query.client_id ? { client_id: query.client_id } : {}),
    },
    query,
    ctx
  );

  const roots = await WorkspaceFolder.findAll({
    where: rootWhere,
    order: [
      ["sort_order", "ASC"],
      ["name", "ASC"],
    ],
  });

  async function buildNode(folder) {
    const contents = await getFolderContents(folder.id, query, ctx);
    const childFolders = await Promise.all(
      contents.children.folders.map(async (child) => {
        const childModel = await WorkspaceFolder.findByPk(child.id);
        return buildNode(childModel);
      })
    );

    return {
      ...folder.toJSON(),
      itemType: "folder",
      children: childFolders,
      files: contents.children.projects,
    };
  }

  const tree = await Promise.all(roots.map(buildNode));

  const rootProjectsWhere = applyVisibility(
    {
      folder_id: null,
      ...(query.client_id ? { client_id: query.client_id } : {}),
    },
    query,
    ctx
  );

  const rootProjects = await Project.findAll({
    where: rootProjectsWhere,
    order: [["name", "ASC"]],
  });

  return {
    tree,
    rootFiles: rootProjects.map((p) => ({ ...p.toJSON(), itemType: "file" })),
  };
}

async function createFolder(payload, ctx) {
  if (!payload.name?.trim()) {
    throw new AppError("Nome da pasta é obrigatório", 400, "VALIDATION_ERROR");
  }

  const tenantId = resolveTenantIdForWrite(ctx, payload.tenant_id);

  if (payload.parent_id) {
    const parent = await WorkspaceFolder.findByPk(payload.parent_id);
    assertResourceTenant(parent, ctx, "FOLDER_NOT_FOUND");
    if (payload.client_id && parent.client_id && parent.client_id !== payload.client_id) {
      throw new AppError("client_id incompatível com a pasta pai", 400, "VALIDATION_ERROR");
    }
  }

  if (payload.client_id) {
    const client = await Client.findByPk(payload.client_id);
    assertResourceTenant(client, ctx, "CLIENT_NOT_FOUND");
  }

  const baseSlug = slugify(payload.slug || payload.name);
  const slug = await ensureUniqueFolderSlug({
    parentId: payload.parent_id || null,
    clientId: payload.client_id || null,
    baseSlug,
  });

  const folder = await WorkspaceFolder.create({
    tenant_id: tenantId,
    parent_id: payload.parent_id || null,
    client_id: payload.client_id || null,
    name: payload.name.trim(),
    slug,
    description: payload.description?.trim() || null,
    color: payload.color || "#8b5cf6",
    icon: payload.icon || "folder",
    sort_order: payload.sort_order ?? 0,
    is_hidden: payload.is_hidden ?? false,
    is_active: payload.is_active ?? true,
  });

  if (ctx.userId) {
    await notificationsService.createAndEmit({
      userId: ctx.userId,
      tenantId,
      eventType: NOTIFICATION_EVENTS.FOLDER_CREATED,
      title: "Nova pasta criada",
      message: `Pasta "${folder.name}" foi criada`,
      entityType: "folder",
      entityId: folder.id,
      payload: { folderId: folder.id },
    });
  }

  return folder;
}

async function updateFolder(id, payload, ctx) {
  const folder = await WorkspaceFolder.findByPk(id);
  assertResourceTenant(folder, ctx, "FOLDER_NOT_FOUND");

  const updates = {};
  const fields = ["name", "description", "color", "icon", "sort_order", "is_hidden", "is_active", "client_id"];

  fields.forEach((field) => {
    if (payload[field] !== undefined) {
      updates[field] = typeof payload[field] === "string" ? payload[field].trim() : payload[field];
    }
  });

  if (payload.slug !== undefined || payload.name !== undefined) {
    const baseSlug = slugify(payload.slug || updates.name || folder.name);
    updates.slug = await ensureUniqueFolderSlug({
      parentId: payload.parent_id !== undefined ? payload.parent_id : folder.parent_id,
      clientId: payload.client_id !== undefined ? payload.client_id : folder.client_id,
      baseSlug,
      excludeId: folder.id,
    });
  }

  if (payload.parent_id !== undefined) {
    if (payload.parent_id === id) {
      throw new AppError("Uma pasta não pode ser pai de si mesma", 400, "VALIDATION_ERROR");
    }
    if (payload.parent_id && (await isDescendant(id, payload.parent_id))) {
      throw new AppError("Não é possível mover pasta para dentro de uma subpasta", 400, "CYCLE_ERROR");
    }
    updates.parent_id = payload.parent_id || null;
  }

  await folder.update(updates);
  return folder;
}

async function moveProjectToFolder(projectId, folderId, ctx) {
  const project = await Project.findByPk(projectId);
  assertResourceTenant(project, ctx, "PROJECT_NOT_FOUND");

  if (folderId) {
    const folder = await WorkspaceFolder.findByPk(folderId);
    assertResourceTenant(folder, ctx, "FOLDER_NOT_FOUND");
  }

  await project.update({ folder_id: folderId || null });

  if (ctx.userId) {
    await notificationsService.createAndEmit({
      userId: ctx.userId,
      tenantId: project.tenant_id,
      eventType: NOTIFICATION_EVENTS.PROJECT_MOVED,
      title: "Projeto movido",
      message: `"${project.name}" foi movido para ${folderId ? "uma pasta" : "a raiz"}`,
      entityType: "project",
      entityId: project.id,
      payload: { projectId: project.id, folderId },
    });
  }

  return project;
}

async function deleteFolder(id, ctx) {
  const folder = await WorkspaceFolder.findByPk(id);
  assertResourceTenant(folder, ctx, "FOLDER_NOT_FOUND");

  const childCount = await WorkspaceFolder.count({ where: { parent_id: id } });
  const projectCount = await Project.count({ where: { folder_id: id } });

  if (childCount > 0 || projectCount > 0) {
    throw new AppError(
      "Pasta não está vazia. Mova ou remova subpastas e projetos antes.",
      409,
      "FOLDER_NOT_EMPTY"
    );
  }

  await folder.destroy();
}

module.exports = {
  listFolders,
  getFolderContents,
  getWorkspaceTree,
  createFolder,
  updateFolder,
  moveProjectToFolder,
  deleteFolder,
};
