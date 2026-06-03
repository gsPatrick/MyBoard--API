const { Board, Project, Client } = require("../../models");
const AppError = require("../../utils/app-error");
const {
  applyTenantFilter,
  resolveTenantIdForWrite,
  assertResourceTenant,
} = require("../../utils/request-context");

const EMPTY_SCENE = {
  elements: [],
  appState: {},
  files: {},
};

function normalizeSceneData(scene) {
  if (!scene || typeof scene !== "object") return { ...EMPTY_SCENE };
  return {
    elements: Array.isArray(scene.elements) ? scene.elements : [],
    appState: scene.appState && typeof scene.appState === "object" ? scene.appState : {},
    files: scene.files && typeof scene.files === "object" ? scene.files : {},
  };
}

async function ensureProjectBelongsToTenant(projectId, ctx) {
  if (!projectId) return null;
  const project = await Project.findByPk(projectId);
  assertResourceTenant(project, ctx, "PROJECT_NOT_FOUND");
  return project;
}

async function listBoards(query = {}, ctx) {
  const where = applyTenantFilter({}, ctx);

  if (query.project_id === "null") {
    where.project_id = null;
  } else if (query.project_id) {
    where.project_id = query.project_id;
  }

  return Board.findAll({
    where,
    include: [
      {
        model: Project,
        as: "project",
        required: false,
        attributes: ["id", "name", "slug", "color", "client_id"],
        include: [
          {
            model: Client,
            as: "client",
            attributes: ["id", "name"],
          },
        ],
      },
    ],
    order: [
      ["is_default", "DESC"],
      ["updated_at", "DESC"],
    ],
  });
}

async function getBoardById(id, ctx) {
  const board = await Board.findByPk(id, {
    include: [
      {
        model: Project,
        as: "project",
        required: false,
        attributes: ["id", "name", "slug", "color", "client_id"],
        include: [
          {
            model: Client,
            as: "client",
            attributes: ["id", "name"],
          },
        ],
      },
    ],
  });

  if (!board) {
    throw new AppError("Board não encontrado", 404, "BOARD_NOT_FOUND");
  }

  assertResourceTenant(board, ctx, "BOARD_NOT_FOUND");
  return board;
}

async function getOrCreateDefaultBoard(ctx) {
  const where = applyTenantFilter({ is_default: true, project_id: null }, ctx);
  let board = await Board.findOne({
    where,
    include: [
      {
        model: Project,
        as: "project",
        required: false,
        attributes: ["id", "name", "slug", "color"],
      },
    ],
  });

  if (board) return board;

  const tenantId = resolveTenantIdForWrite(ctx);
  board = await Board.create({
    tenant_id: tenantId,
    project_id: null,
    name: "Board principal",
    scene_data: { ...EMPTY_SCENE },
    is_default: true,
    created_by_user_id: ctx?.userId || null,
  });

  return board;
}

async function createBoard(payload, ctx) {
  if (!payload.name?.trim()) {
    throw new AppError("Nome do board é obrigatório", 400, "VALIDATION_ERROR");
  }

  const tenantId = resolveTenantIdForWrite(ctx, payload.tenant_id);
  await ensureProjectBelongsToTenant(payload.project_id || null, ctx);

  const isDefault = Boolean(payload.is_default) && !payload.project_id;

  if (isDefault) {
    await Board.update(
      { is_default: false },
      { where: applyTenantFilter({ project_id: null }, ctx) }
    );
  }

  return Board.create({
    tenant_id: tenantId,
    project_id: payload.project_id || null,
    name: payload.name.trim(),
    scene_data: normalizeSceneData(payload.scene_data),
    is_default: isDefault,
    created_by_user_id: ctx?.userId || null,
  });
}

async function updateBoard(id, payload, ctx) {
  const board = await getBoardById(id, ctx);
  const updates = {};

  if (payload.name !== undefined) {
    if (!payload.name?.trim()) {
      throw new AppError("Nome do board é obrigatório", 400, "VALIDATION_ERROR");
    }
    updates.name = payload.name.trim();
  }

  if (payload.project_id !== undefined) {
    await ensureProjectBelongsToTenant(payload.project_id || null, ctx);
    updates.project_id = payload.project_id || null;
    if (payload.project_id) {
      updates.is_default = false;
    }
  }

  if (payload.scene_data !== undefined) {
    updates.scene_data = normalizeSceneData(payload.scene_data);
  }

  if (payload.is_default === true && !board.project_id && !payload.project_id) {
    await Board.update(
      { is_default: false },
      { where: applyTenantFilter({ project_id: null }, ctx) }
    );
    updates.is_default = true;
  }

  await board.update(updates);
  return getBoardById(id, ctx);
}

async function deleteBoard(id, ctx) {
  const board = await getBoardById(id, ctx);

  if (board.is_default) {
    throw new AppError("O board principal não pode ser excluído", 409, "BOARD_DEFAULT_LOCKED");
  }

  await board.destroy();
}

module.exports = {
  listBoards,
  getBoardById,
  getOrCreateDefaultBoard,
  createBoard,
  updateBoard,
  deleteBoard,
  normalizeSceneData,
};
