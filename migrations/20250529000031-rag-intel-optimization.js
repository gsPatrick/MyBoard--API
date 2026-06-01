"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("rag_facts", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      tenant_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "tenants", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      client_id: { type: Sequelize.UUID, allowNull: true },
      project_id: { type: Sequelize.UUID, allowNull: true },
      conversation_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "rag_conversations", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      message_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "rag_messages", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      fact_type: {
        type: Sequelize.ENUM(
          "deal_value",
          "deal_date",
          "contract",
          "payment",
          "deadline",
          "contact",
          "decision",
          "scope",
          "document",
          "other"
        ),
        allowNull: false,
      },
      fact_key: { type: Sequelize.STRING(120), allowNull: false, defaultValue: "primary" },
      label: { type: Sequelize.STRING(300), allowNull: true },
      value_text: { type: Sequelize.TEXT, allowNull: true },
      value_number: { type: Sequelize.DECIMAL(16, 2), allowNull: true },
      value_date: { type: Sequelize.DATE, allowNull: true },
      value_json: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      confidence: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 0.7 },
      source_channel: { type: Sequelize.STRING(40), allowNull: true },
      source_excerpt: { type: Sequelize.TEXT, allowNull: true },
      metadata: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
    });

    await queryInterface.addIndex("rag_facts", ["tenant_id", "project_id", "fact_type"]);
    await queryInterface.addIndex("rag_facts", ["tenant_id", "client_id", "fact_type"]);
    await queryInterface.addIndex("rag_facts", ["tenant_id", "fact_type", "fact_key"]);
    await queryInterface.addIndex(
      "rag_facts",
      ["tenant_id", "project_id", "fact_type", "fact_key"],
      { unique: true, name: "rag_facts_project_type_key_unique" }
    );

    await queryInterface.createTable("rag_message_assets", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      tenant_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "tenants", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      message_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "rag_messages", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      conversation_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "rag_conversations", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      client_id: { type: Sequelize.UUID, allowNull: true },
      project_id: { type: Sequelize.UUID, allowNull: true },
      media_file_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "media_files", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      asset_type: {
        type: Sequelize.ENUM("document", "audio", "image", "video", "other"),
        allowNull: false,
      },
      original_name: { type: Sequelize.STRING(500), allowNull: true },
      mime_type: { type: Sequelize.STRING(150), allowNull: true },
      extracted_text: { type: Sequelize.TEXT, allowNull: true },
      token_estimate: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      is_contract: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      metadata: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
    });

    await queryInterface.addIndex("rag_message_assets", ["tenant_id", "project_id"]);
    await queryInterface.addIndex("rag_message_assets", ["tenant_id", "client_id"]);
    await queryInterface.addIndex("rag_message_assets", ["message_id"], { unique: true });

    await queryInterface.addColumn("rag_messages", "storage_optimized", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await queryInterface.addColumn("rag_messages", "content_hash", {
      type: Sequelize.STRING(64),
      allowNull: true,
    });

    await queryInterface.addColumn("rag_chunks", "content_hash", {
      type: Sequelize.STRING(64),
      allowNull: true,
    });

    await queryInterface.addIndex("rag_chunks", ["tenant_id", "content_hash"]);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS rag_facts_value_text_trgm
      ON rag_facts USING gin (value_text gin_trgm_ops);
    `).catch(() => {});

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS rag_message_assets_extracted_text_trgm
      ON rag_message_assets USING gin (extracted_text gin_trgm_ops);
    `).catch(() => {});
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("rag_chunks", "content_hash");
    await queryInterface.removeColumn("rag_messages", "content_hash");
    await queryInterface.removeColumn("rag_messages", "storage_optimized");
    await queryInterface.dropTable("rag_message_assets");
    await queryInterface.dropTable("rag_facts");
  },
};
