"use strict";

/**
 * Novo status "maintenance" (Manutenção) no enum de status de projetos.
 * Manutenção usa o mesmo motor de recorrência (is_recurring + campos de
 * recurrence_*), diferindo apenas pelo status/rótulo.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_projects_status" ADD VALUE IF NOT EXISTS 'maintenance';
    `);
  },

  async down() {
    // Postgres não remove valores de enum; nada a desfazer.
  },
};
