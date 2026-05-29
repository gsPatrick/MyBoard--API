"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("workspace_folders", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      parent_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "workspace_folders", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      client_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "clients", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
        comment: "Null = pasta global; preenchido = workspace do cliente",
      },
      name: {
        type: Sequelize.STRING(200),
        allowNull: false,
      },
      slug: {
        type: Sequelize.STRING(220),
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      color: {
        type: Sequelize.STRING(20),
        allowNull: true,
        defaultValue: "#8b5cf6",
      },
      icon: {
        type: Sequelize.STRING(50),
        allowNull: true,
        defaultValue: "folder",
      },
      sort_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      is_hidden: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
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

    await queryInterface.addIndex("workspace_folders", ["parent_id"]);
    await queryInterface.addIndex("workspace_folders", ["client_id"]);
    await queryInterface.addIndex("workspace_folders", ["is_hidden"]);
    await queryInterface.addIndex("workspace_folders", ["is_active"]);
    await queryInterface.addIndex("workspace_folders", ["parent_id", "client_id", "slug"], {
      unique: true,
      name: "workspace_folders_parent_client_slug_unique",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("workspace_folders");
  },
};
