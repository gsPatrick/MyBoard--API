"use strict";

/**
 * Data em que o projeto foi concluído (status "completed").
 * Usada no card do dashboard: "Concluídos no mês" e o ciclo que zera
 * "Projetos finalizados" quando todo o lote em aberto é concluído.
 * Backfill: projetos já concluídos recebem o updated_at como melhor estimativa.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("projects", "completed_at", {
      type: Sequelize.DATE,
      allowNull: true,
      comment: "Quando o status virou 'completed' (null se não concluído)",
    });

    await queryInterface.sequelize.query(`
      UPDATE projects SET completed_at = updated_at
      WHERE status = 'completed' AND completed_at IS NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("projects", "completed_at");
  },
};
