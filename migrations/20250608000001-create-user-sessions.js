"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("user_sessions", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      jti: { type: Sequelize.STRING(64), allowNull: false, unique: true },
      platform: { type: Sequelize.STRING(16), allowNull: false, defaultValue: "web" },
      client_name: { type: Sequelize.STRING(120), allowNull: true },
      browser: { type: Sequelize.STRING(60), allowNull: true },
      os: { type: Sequelize.STRING(60), allowNull: true },
      user_agent: { type: Sequelize.TEXT, allowNull: true },
      ip_address: { type: Sequelize.STRING(64), allowNull: true },
      last_seen_at: { type: Sequelize.DATE, allowNull: true },
      revoked_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    await queryInterface.addIndex("user_sessions", ["user_id"]);
    await queryInterface.addIndex("user_sessions", ["jti"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("user_sessions");
  },
};
