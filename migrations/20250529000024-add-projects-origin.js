"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("projects", "origin", {
      type: Sequelize.ENUM("own", "99freelas", "workana"),
      allowNull: false,
      defaultValue: "own",
      comment: "Origem do projeto: próprio, 99Freelas ou Workana",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("projects", "origin");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_projects_origin";');
  },
};
