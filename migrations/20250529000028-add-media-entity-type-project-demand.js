"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_media_files_entity_type" ADD VALUE IF NOT EXISTS 'project_demand';
    `);
  },

  async down() {
    // PostgreSQL não permite remover valores de ENUM de forma segura.
  },
};
