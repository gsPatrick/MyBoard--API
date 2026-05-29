const { Tag, ClientTag, ProjectTag } = require("../../models");
const AppError = require("../../utils/app-error");
const { TAG_SCOPES } = require("../../config/constants");
const { slugify } = require("../../utils/crypto");

async function listTags(query = {}) {
  const where = {};
  if (query.scope && TAG_SCOPES.includes(query.scope)) {
    where.scope = query.scope;
  }

  return Tag.findAll({
    where,
    order: [
      ["importance_weight", "DESC"],
      ["name", "ASC"],
    ],
  });
}

async function createTag(payload) {
  if (!payload.name?.trim()) {
    throw new AppError("Nome da tag é obrigatório", 400, "VALIDATION_ERROR");
  }

  const slug = slugify(payload.slug || payload.name);

  return Tag.create({
    name: payload.name.trim(),
    slug,
    color: payload.color || "#6366f1",
    scope: payload.scope || "both",
    importance_weight: payload.importance_weight ?? 0,
  });
}

async function syncClientTags(clientId, tagIds = []) {
  if (!Array.isArray(tagIds)) return;

  await ClientTag.destroy({ where: { client_id: clientId } });

  if (tagIds.length === 0) return;

  const tags = await Tag.findAll({ where: { id: tagIds } });
  await ClientTag.bulkCreate(
    tags.map((tag) => ({ client_id: clientId, tag_id: tag.id }))
  );
}

async function syncProjectTags(projectId, tagIds = []) {
  if (!Array.isArray(tagIds)) return;

  await ProjectTag.destroy({ where: { project_id: projectId } });

  if (tagIds.length === 0) return;

  const tags = await Tag.findAll({ where: { id: tagIds } });
  await ProjectTag.bulkCreate(
    tags.map((tag) => ({ project_id: projectId, tag_id: tag.id }))
  );
}

module.exports = {
  listTags,
  createTag,
  syncClientTags,
  syncProjectTags,
};
