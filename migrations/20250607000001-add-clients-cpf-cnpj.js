"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("clients", "cpf", {
      type: Sequelize.STRING(20),
      allowNull: true,
      comment: "CPF do cliente (pessoa física)",
    });
    await queryInterface.addColumn("clients", "cnpj", {
      type: Sequelize.STRING(20),
      allowNull: true,
      comment: "CNPJ do cliente (pessoa jurídica)",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("clients", "cpf");
    await queryInterface.removeColumn("clients", "cnpj");
  },
};
