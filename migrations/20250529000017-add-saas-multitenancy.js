"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_users_role" ADD VALUE IF NOT EXISTS 'super_admin';
    `);

    await queryInterface.addColumn("users", "tenant_id", {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "tenants", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    });

    const tenantTables = [
      "clients",
      "projects",
      "workspace_folders",
      "tags",
      "agenda_events",
      "notifications",
    ];

    for (const table of tenantTables) {
      await queryInterface.addColumn(table, "tenant_id", {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "tenants", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      });
      await queryInterface.addIndex(table, ["tenant_id"]);
    }

    await queryInterface.addIndex("users", ["tenant_id"]);
    await queryInterface.addIndex("users", ["email", "tenant_id"]);

    await queryInterface.createTable("password_reset_tokens", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      token_hash: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      used_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.addIndex("password_reset_tokens", ["user_id"]);
    await queryInterface.addIndex("password_reset_tokens", ["token_hash"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("password_reset_tokens");

    const tenantTables = [
      "notifications",
      "agenda_events",
      "tags",
      "workspace_folders",
      "projects",
      "clients",
    ];

    for (const table of tenantTables) {
      await queryInterface.removeColumn(table, "tenant_id");
    }

    await queryInterface.removeColumn("users", "tenant_id");
  },
};
