"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("media_files", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      entity_type: {
        type: Sequelize.ENUM("client", "project", "user", "project_detail", "agenda_event", "folder"),
        allowNull: false,
      },
      entity_id: {
        type: Sequelize.UUID,
        allowNull: false,
      },
      kind: {
        type: Sequelize.ENUM("avatar", "cover", "attachment", "thumbnail"),
        allowNull: false,
        defaultValue: "attachment",
      },
      original_name: {
        type: Sequelize.STRING(500),
        allowNull: false,
      },
      stored_name: {
        type: Sequelize.STRING(500),
        allowNull: false,
      },
      mime_type: {
        type: Sequelize.STRING(150),
        allowNull: false,
      },
      size_bytes: {
        type: Sequelize.BIGINT,
        allowNull: false,
      },
      storage_disk: {
        type: Sequelize.ENUM("local", "s3"),
        allowNull: false,
        defaultValue: "local",
      },
      storage_path: {
        type: Sequelize.STRING(1000),
        allowNull: false,
      },
      public_url: {
        type: Sequelize.STRING(1000),
        allowNull: true,
      },
      uploaded_by_user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
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

    await queryInterface.addIndex("media_files", ["entity_type", "entity_id"]);
    await queryInterface.addIndex("media_files", ["kind"]);
    await queryInterface.addIndex("media_files", ["uploaded_by_user_id"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("media_files");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_media_files_entity_type";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_media_files_kind";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_media_files_storage_disk";');
  },
};
