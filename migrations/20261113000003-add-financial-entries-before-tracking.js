"use strict";

/**
 * Marca o lançamento "Recebido antes do cadastro" (valor já recebido informado
 * ao criar o projeto). Ele abate do saldo do projeto, mas fica fora do Lucro:
 * é dinheiro que entrou antes de o projeto existir no MyBoard.
 * Backfill: lançamentos já criados por esse fluxo (identificados pelo título).
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("project_financial_entries", "before_tracking", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: "Recebido antes do cadastro do projeto (fora do cálculo de lucro)",
    });

    await queryInterface.sequelize.query(`
      UPDATE project_financial_entries SET before_tracking = true
      WHERE title = 'Recebido antes do cadastro';
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("project_financial_entries", "before_tracking");
  },
};
