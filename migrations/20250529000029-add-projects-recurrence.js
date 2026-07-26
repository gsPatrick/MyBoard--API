"use strict";

/**
 * Recorrência de projetos.
 *
 * Um projeto recorrente é um projeto normal (vinculado a um cliente, com
 * demandas/financeiro/arquivos) que, todo mês no dia escolhido, gera
 * automaticamente um recebimento no financeiro. Ganha o status "recurring"
 * para aparecer distinto entre os projetos em andamento.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Novo status "recurring" no enum já existente.
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_projects_status" ADD VALUE IF NOT EXISTS 'recurring';
    `);

    await queryInterface.addColumn("projects", "is_recurring", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: "true = projeto recorrente (gera recebimento todo mês no dia escolhido)",
    });

    await queryInterface.addColumn("projects", "recurrence_amount", {
      type: Sequelize.DECIMAL(14, 2),
      allowNull: true,
      comment: "Valor recebido a cada ciclo (independente do budget)",
    });

    await queryInterface.addColumn("projects", "recurrence_day", {
      type: Sequelize.INTEGER,
      allowNull: true,
      comment: "Dia do mês em que o recebimento ocorre (1-31, ajustado para o fim do mês)",
    });

    await queryInterface.addColumn("projects", "recurrence_start_date", {
      type: Sequelize.DATEONLY,
      allowNull: true,
      comment: "Data a partir da qual a recorrência começa a gerar recebimentos",
    });

    await queryInterface.addColumn("projects", "recurrence_end_date", {
      type: Sequelize.DATEONLY,
      allowNull: true,
      comment: "Data limite da recorrência; null = sem fim",
    });

    await queryInterface.addColumn("projects", "recurrence_next_run", {
      type: Sequelize.DATEONLY,
      allowNull: true,
      comment: "Próxima data em que um recebimento deve ser gerado",
    });

    await queryInterface.addIndex("projects", ["is_recurring", "recurrence_next_run"], {
      name: "projects_recurrence_due_idx",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("projects", "projects_recurrence_due_idx");
    await queryInterface.removeColumn("projects", "recurrence_next_run");
    await queryInterface.removeColumn("projects", "recurrence_end_date");
    await queryInterface.removeColumn("projects", "recurrence_start_date");
    await queryInterface.removeColumn("projects", "recurrence_day");
    await queryInterface.removeColumn("projects", "recurrence_amount");
    await queryInterface.removeColumn("projects", "is_recurring");
    // O valor "recurring" permanece no enum (Postgres não remove valores de enum).
  },
};
