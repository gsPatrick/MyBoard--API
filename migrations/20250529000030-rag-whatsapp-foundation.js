"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query("CREATE EXTENSION IF NOT EXISTS vector;").catch(() => {});

    await queryInterface.createTable("whatsapp_instances", {
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
      instance_name: { type: Sequelize.STRING(120), allowNull: false },
      provider: {
        type: Sequelize.STRING(40),
        allowNull: false,
        defaultValue: "evolution",
      },
      evolution_base_url: { type: Sequelize.STRING(500), allowNull: true },
      chatwoot_account_id: { type: Sequelize.STRING(40), allowNull: true },
      chatwoot_inbox_id: { type: Sequelize.STRING(40), allowNull: true },
      chatwoot_url: { type: Sequelize.STRING(500), allowNull: true },
      connection_state: {
        type: Sequelize.STRING(30),
        allowNull: false,
        defaultValue: "unknown",
      },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      settings: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
    });

    await queryInterface.addIndex("whatsapp_instances", ["tenant_id"]);
    await queryInterface.addIndex("whatsapp_instances", ["tenant_id", "instance_name"], {
      unique: true,
      name: "whatsapp_instances_tenant_instance_unique",
    });

    await queryInterface.createTable("client_whatsapp_links", {
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
      client_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "clients", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      phone_e164: { type: Sequelize.STRING(20), allowNull: false },
      phone_digits: { type: Sequelize.STRING(20), allowNull: false },
      label: { type: Sequelize.STRING(120), allowNull: true },
      is_primary: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      whatsapp_jid: { type: Sequelize.STRING(80), allowNull: true },
      metadata: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
    });

    await queryInterface.addIndex("client_whatsapp_links", ["tenant_id", "phone_digits"]);
    await queryInterface.addIndex("client_whatsapp_links", ["client_id"]);
    await queryInterface.addIndex("client_whatsapp_links", ["tenant_id", "client_id", "phone_digits"], {
      unique: true,
      name: "client_whatsapp_links_unique_phone",
    });

    await queryInterface.createTable("project_whatsapp_links", {
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
      project_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "projects", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      link_type: {
        type: Sequelize.ENUM("phone", "group"),
        allowNull: false,
      },
      external_id: { type: Sequelize.STRING(120), allowNull: false },
      display_name: { type: Sequelize.STRING(200), allowNull: true },
      whatsapp_jid: { type: Sequelize.STRING(120), allowNull: true },
      metadata: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
    });

    await queryInterface.addIndex("project_whatsapp_links", ["tenant_id", "external_id"]);
    await queryInterface.addIndex("project_whatsapp_links", ["project_id"]);
    await queryInterface.addIndex("project_whatsapp_links", ["tenant_id", "project_id", "link_type", "external_id"], {
      unique: true,
      name: "project_whatsapp_links_unique_external",
    });

    await queryInterface.createTable("rag_conversations", {
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
      channel: {
        type: Sequelize.ENUM("whatsapp", "chatwoot", "in_app", "manual", "workspace"),
        allowNull: false,
      },
      external_thread_id: { type: Sequelize.STRING(200), allowNull: false },
      whatsapp_instance_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "whatsapp_instances", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      client_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "clients", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      project_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "projects", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      title: { type: Sequelize.STRING(300), allowNull: true },
      participant_label: { type: Sequelize.STRING(200), allowNull: true },
      is_group: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      message_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      token_estimate: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
      last_message_at: { type: Sequelize.DATE, allowNull: true },
      metadata: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
    });

    await queryInterface.addIndex("rag_conversations", ["tenant_id", "channel", "external_thread_id"], {
      unique: true,
      name: "rag_conversations_thread_unique",
    });
    await queryInterface.addIndex("rag_conversations", ["tenant_id", "client_id"]);
    await queryInterface.addIndex("rag_conversations", ["tenant_id", "project_id"]);
    await queryInterface.addIndex("rag_conversations", ["tenant_id", "last_message_at"]);

    await queryInterface.createTable("rag_messages", {
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
      conversation_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "rag_conversations", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      external_message_id: { type: Sequelize.STRING(200), allowNull: false },
      direction: {
        type: Sequelize.ENUM("inbound", "outbound", "system"),
        allowNull: false,
        defaultValue: "inbound",
      },
      sender_id: { type: Sequelize.STRING(120), allowNull: true },
      sender_name: { type: Sequelize.STRING(200), allowNull: true },
      content_type: {
        type: Sequelize.ENUM("text", "audio", "image", "video", "document", "location", "reaction", "other"),
        allowNull: false,
        defaultValue: "text",
      },
      body_text: { type: Sequelize.TEXT, allowNull: true },
      body_normalized: { type: Sequelize.TEXT, allowNull: true },
      token_estimate: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      sent_at: { type: Sequelize.DATE, allowNull: false },
      raw_payload: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      metadata: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
    });

    await queryInterface.addIndex("rag_messages", ["conversation_id", "external_message_id"], {
      unique: true,
      name: "rag_messages_external_unique",
    });
    await queryInterface.addIndex("rag_messages", ["tenant_id", "sent_at"]);
    await queryInterface.addIndex("rag_messages", ["conversation_id", "sent_at"]);

    await queryInterface.createTable("rag_chunks", {
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
      conversation_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "rag_conversations", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      client_id: { type: Sequelize.UUID, allowNull: true },
      project_id: { type: Sequelize.UUID, allowNull: true },
      channel: {
        type: Sequelize.ENUM("whatsapp", "chatwoot", "in_app", "manual", "workspace"),
        allowNull: false,
      },
      source_type: {
        type: Sequelize.ENUM(
          "whatsapp_message",
          "chatwoot_message",
          "project_note",
          "client_note",
          "demand",
          "agenda",
          "manual"
        ),
        allowNull: false,
        defaultValue: "whatsapp_message",
      },
      chunk_index: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      content: { type: Sequelize.TEXT, allowNull: false },
      token_estimate: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      message_ids: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      period_start: { type: Sequelize.DATE, allowNull: true },
      period_end: { type: Sequelize.DATE, allowNull: true },
      embedding_model: { type: Sequelize.STRING(120), allowNull: true },
      embedding: { type: Sequelize.JSONB, allowNull: true },
      metadata: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
    });

    await queryInterface.addIndex("rag_chunks", ["tenant_id", "client_id"]);
    await queryInterface.addIndex("rag_chunks", ["tenant_id", "project_id"]);
    await queryInterface.addIndex("rag_chunks", ["tenant_id", "channel"]);
    await queryInterface.addIndex("rag_chunks", ["conversation_id", "chunk_index"]);

    await queryInterface.sequelize.query(`
      ALTER TABLE rag_chunks
      ADD COLUMN IF NOT EXISTS search_vector tsvector
      GENERATED ALWAYS AS (to_tsvector('portuguese', coalesce(content, ''))) STORED;
    `).catch(async () => {
      await queryInterface.addColumn("rag_chunks", "search_vector", {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    });

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS rag_chunks_search_vector_idx ON rag_chunks USING GIN (search_vector);
    `).catch(() => {});

    await queryInterface.createTable("rag_summaries", {
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
      conversation_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "rag_conversations", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      client_id: { type: Sequelize.UUID, allowNull: true },
      project_id: { type: Sequelize.UUID, allowNull: true },
      level: {
        type: Sequelize.ENUM("message_window", "daily", "weekly", "thread", "project", "client"),
        allowNull: false,
      },
      period_start: { type: Sequelize.DATE, allowNull: true },
      period_end: { type: Sequelize.DATE, allowNull: true },
      content: { type: Sequelize.TEXT, allowNull: false },
      token_estimate: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      source_chunk_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      metadata: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
    });

    await queryInterface.addIndex("rag_summaries", ["tenant_id", "conversation_id", "level"]);
    await queryInterface.addIndex("rag_summaries", ["tenant_id", "client_id", "level"]);
    await queryInterface.addIndex("rag_summaries", ["tenant_id", "project_id", "level"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("rag_summaries");
    await queryInterface.dropTable("rag_chunks");
    await queryInterface.dropTable("rag_messages");
    await queryInterface.dropTable("rag_conversations");
    await queryInterface.dropTable("project_whatsapp_links");
    await queryInterface.dropTable("client_whatsapp_links");
    await queryInterface.dropTable("whatsapp_instances");
  },
};
