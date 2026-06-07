"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("user_passkeys", {
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
      credential_id: { type: Sequelize.STRING(512), allowNull: false, unique: true },
      public_key: { type: Sequelize.TEXT, allowNull: false },
      counter: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
      transports: { type: Sequelize.STRING(255), allowNull: true },
      device_type: { type: Sequelize.STRING(32), allowNull: true },
      backed_up: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      name: { type: Sequelize.STRING(120), allowNull: true },
      last_used_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    await queryInterface.addIndex("user_passkeys", ["user_id"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("user_passkeys");
  },
};
