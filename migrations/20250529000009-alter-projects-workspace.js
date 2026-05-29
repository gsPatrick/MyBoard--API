"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("projects", "folder_id", {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "workspace_folders", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
      comment: "Pasta onde o projeto vive (metáfora de arquivo)",
    });

    await queryInterface.addColumn("projects", "importance_level", {
      type: Sequelize.ENUM("normal", "important", "high", "critical", "vip"),
      allowNull: false,
      defaultValue: "normal",
    });

    await queryInterface.addColumn("projects", "is_hidden", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await queryInterface.addColumn("projects", "is_active", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });

    await queryInterface.addColumn("projects", "icon", {
      type: Sequelize.STRING(50),
      allowNull: true,
      defaultValue: "file-code",
      comment: "Ícone do arquivo/projeto na árvore",
    });

    await queryInterface.addColumn("projects", "color", {
      type: Sequelize.STRING(20),
      allowNull: true,
      defaultValue: "#3b82f6",
    });

    await queryInterface.addColumn("projects", "cover_media_id", {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "media_files", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });

    await queryInterface.addIndex("projects", ["folder_id"]);
    await queryInterface.addIndex("projects", ["importance_level"]);
    await queryInterface.addIndex("projects", ["is_hidden"]);
    await queryInterface.addIndex("projects", ["is_active"]);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("projects", "cover_media_id");
    await queryInterface.removeColumn("projects", "color");
    await queryInterface.removeColumn("projects", "icon");
    await queryInterface.removeColumn("projects", "is_active");
    await queryInterface.removeColumn("projects", "is_hidden");
    await queryInterface.removeColumn("projects", "importance_level");
    await queryInterface.removeColumn("projects", "folder_id");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_projects_importance_level";');
  },
};
