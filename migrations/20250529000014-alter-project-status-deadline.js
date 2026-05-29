"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("projects", "has_deadline", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: "false = sem prazo; true = due_date obrigatório",
    });

    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_projects_status" ADD VALUE IF NOT EXISTS 'in_progress';
    `);
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_projects_status" ADD VALUE IF NOT EXISTS 'cancelled';
    `);

    await queryInterface.sequelize.query(`
      UPDATE projects SET status = 'in_progress' WHERE status = 'active';
    `);
    await queryInterface.sequelize.query(`
      UPDATE projects SET status = 'completed' WHERE status = 'archived';
    `);

    await queryInterface.sequelize.query(`
      UPDATE projects SET has_deadline = true WHERE due_date IS NOT NULL;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE projects ALTER COLUMN status SET DEFAULT 'in_progress';
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE projects SET status = 'active' WHERE status = 'in_progress';
    `);
    await queryInterface.sequelize.query(`
      UPDATE projects SET status = 'archived' WHERE status = 'cancelled';
    `);

    await queryInterface.removeColumn("projects", "has_deadline");

    await queryInterface.sequelize.query(`
      ALTER TABLE projects ALTER COLUMN status SET DEFAULT 'draft';
    `);
  },
};
