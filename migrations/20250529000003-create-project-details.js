"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("project_details", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      project_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "projects",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      category: {
        type: Sequelize.ENUM(
          "github",
          "credentials",
          "scope",
          "deployment",
          "environment",
          "documentation",
          "links",
          "notes",
          "custom"
        ),
        allowNull: false,
        defaultValue: "custom",
      },
      key: {
        type: Sequelize.STRING(120),
        allowNull: false,
        comment: "Identificador único dentro do projeto+categoria",
      },
      label: {
        type: Sequelize.STRING(200),
        allowNull: false,
      },
      value_type: {
        type: Sequelize.ENUM("text", "json", "url", "markdown", "secret"),
        allowNull: false,
        defaultValue: "text",
      },
      value_text: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      value_json: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      is_secret: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      sort_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
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

    await queryInterface.addIndex("project_details", ["project_id"]);
    await queryInterface.addIndex("project_details", ["category"]);
    await queryInterface.addIndex("project_details", ["project_id", "category"]);
    await queryInterface.addIndex("project_details", ["project_id", "key"], {
      unique: true,
      name: "project_details_project_id_key_unique",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("project_details");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_project_details_category";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_project_details_value_type";');
  },
};
