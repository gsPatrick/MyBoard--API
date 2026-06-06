const projectsService = require("../../projects/projects.service");
const clientsService = require("../../clients/clients.service");

// Resolvedores compartilhados de projeto/cliente por id ou nome (sem ciclo de import).
async function resolveProject({ project_id, name } = {}, ctx) {
  if (project_id) {
    try {
      return await projectsService.getProjectById(project_id, { includeDetails: false }, ctx);
    } catch {
      return null;
    }
  }
  if (name) {
    const { items } = await projectsService.listProjects(
      { search: name, limit: 5, include_inactive: "true", include_hidden: "true" },
      ctx
    );
    const exact = items.find((p) => p.name?.toLowerCase() === String(name).toLowerCase());
    return exact || items[0] || null;
  }
  return null;
}

async function resolveClient({ client_id, name } = {}, ctx) {
  if (client_id) {
    try {
      return await clientsService.getClientById(client_id, ctx);
    } catch {
      return null;
    }
  }
  if (name) {
    const { items } = await clientsService.listClients(
      { search: name, limit: 5, include_inactive: "true", include_hidden: "true" },
      ctx
    );
    const exact = items.find((c) => c.name?.toLowerCase() === String(name).toLowerCase());
    return exact || items[0] || null;
  }
  return null;
}

module.exports = { resolveProject, resolveClient };
