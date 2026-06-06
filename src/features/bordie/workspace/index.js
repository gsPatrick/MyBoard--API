const projects = require("./projects.tools");
const clients = require("./clients.tools");
const agenda = require("./agenda.tools");
const finance = require("./finance.tools");
const demands = require("./demands.tools");
const organization = require("./organization.tools");
const details = require("./details.tools");
const overview = require("./overview.tools");

const MODULES = [projects, clients, agenda, finance, demands, organization, details, overview];

// Definições no formato function-calling (OpenAI) para enviar ao LLM.
const toolDefinitions = MODULES.flatMap((mod) => mod.definitions);

// Mapa nome -> { kind: 'read'|'write', run?, build? }
const toolRegistry = MODULES.reduce((acc, mod) => {
  for (const [name, impl] of Object.entries(mod.tools)) {
    acc[name] = impl;
  }
  return acc;
}, {});

function getToolDefinitions() {
  return toolDefinitions;
}

function getTool(name) {
  return toolRegistry[name] || null;
}

module.exports = {
  getToolDefinitions,
  getTool,
  toProjectEntity: projects.toProjectEntity,
  toClientEntity: clients.toClientEntity,
  toAgendaEntity: agenda.toAgendaEntity,
  toFinanceEntity: finance.toFinanceEntity,
  toDemandEntity: demands.toDemandEntity,
  toFolderEntity: organization.toFolderEntity,
  toTagEntity: organization.toTagEntity,
  toDetailEntity: details.toDetailEntity,
};
