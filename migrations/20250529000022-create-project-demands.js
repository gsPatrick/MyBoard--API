"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("project_demands", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      project_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "projects", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      title: {
        type: Sequelize.STRING(300),
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM("pending", "in_progress", "done", "cancelled"),
        allowNull: false,
        defaultValue: "pending",
      },
      sort_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      completed_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.addIndex("project_demands", ["project_id"]);
    await queryInterface.addIndex("project_demands", ["project_id", "status"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("project_demands");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_project_demands_status";');
  },
};
