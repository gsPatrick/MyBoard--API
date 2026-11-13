"use strict";

/**
 * Novo status "job" (Trabalho) no enum de status de projetos.
 * Trabalho = emprego com salário mensal: usa o mesmo motor de recorrência
 * (is_recurring + recurrence_*) que Recorrente/Manutenção, diferindo só
 * pelo status/rótulo.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_projects_status" ADD VALUE IF NOT EXISTS 'job';
    `);
  },

  async down() {
    // Postgres não remove valores de enum; nada a desfazer.
  },
};
