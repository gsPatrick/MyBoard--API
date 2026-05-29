"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("project_financial_entries", {
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
      entry_type: {
        type: Sequelize.ENUM(
          "entrada",
          "adiantamento",
          "sprint",
          "parcela",
          "final",
          "outro"
        ),
        allowNull: false,
        defaultValue: "entrada",
      },
      amount: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false,
      },
      title: {
        type: Sequelize.STRING(300),
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      entry_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
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

    await queryInterface.addIndex("project_financial_entries", ["project_id"]);
    await queryInterface.addIndex("project_financial_entries", ["project_id", "entry_type"]);
    await queryInterface.addIndex("project_financial_entries", ["entry_date"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("project_financial_entries");
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_project_financial_entries_entry_type";'
    );
  },
};
