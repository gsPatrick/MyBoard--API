"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("clients", "importance_level", {
      type: Sequelize.ENUM("normal", "important", "high", "critical", "vip"),
      allowNull: false,
      defaultValue: "normal",
    });

    await queryInterface.addColumn("clients", "is_hidden", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await queryInterface.addColumn("clients", "is_active", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });

    await queryInterface.addColumn("clients", "avatar_media_id", {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "media_files", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });

    await queryInterface.addIndex("clients", ["importance_level"]);
    await queryInterface.addIndex("clients", ["is_hidden"]);
    await queryInterface.addIndex("clients", ["is_active"]);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("clients", "avatar_media_id");
    await queryInterface.removeColumn("clients", "is_active");
    await queryInterface.removeColumn("clients", "is_hidden");
    await queryInterface.removeColumn("clients", "importance_level");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_clients_importance_level";');
  },
};
