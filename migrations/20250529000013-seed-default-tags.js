"use strict";

const { randomUUID } = require("crypto");

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const now = new Date();

    await queryInterface.bulkInsert("tags", [
      { id: randomUUID(), name: "VIP", slug: "vip", color: "#ef4444", scope: "both", importance_weight: 100, created_at: now, updated_at: now },
      { id: randomUUID(), name: "Urgente", slug: "urgente", color: "#f97316", scope: "both", importance_weight: 80, created_at: now, updated_at: now },
      { id: randomUUID(), name: "Recorrente", slug: "recorrente", color: "#3b82f6", scope: "client", importance_weight: 40, created_at: now, updated_at: now },
      { id: randomUUID(), name: "Manutenção", slug: "manutencao", color: "#8b5cf6", scope: "project", importance_weight: 30, created_at: now, updated_at: now },
      { id: randomUUID(), name: "Legado", slug: "legado", color: "#6b7280", scope: "project", importance_weight: 10, created_at: now, updated_at: now },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("tags", {
      slug: ["vip", "urgente", "recorrente", "manutencao", "legado"],
    });
  },
};
