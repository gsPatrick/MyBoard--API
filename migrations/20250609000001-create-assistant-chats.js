"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("assistant_chats", {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      tenant_id: { type: Sequelize.UUID, allowNull: false },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      // Pode começar SEM projeto e ser vinculado depois (SET NULL se o projeto sumir).
      project_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "projects", key: "id" },
        onDelete: "SET NULL",
      },
      title: { type: Sequelize.STRING(300), allowNull: true },
      system_instructions: { type: Sequelize.TEXT, allowNull: true },
      model: { type: Sequelize.STRING(120), allowNull: true },
      settings: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      message_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      last_message_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    await queryInterface.addIndex("assistant_chats", ["tenant_id", "user_id"]);
    await queryInterface.addIndex("assistant_chats", ["project_id"]);

    await queryInterface.createTable("assistant_chat_messages", {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      tenant_id: { type: Sequelize.UUID, allowNull: false },
      chat_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "assistant_chats", key: "id" },
        onDelete: "CASCADE",
      },
      role: { type: Sequelize.STRING(20), allowNull: false, defaultValue: "user" },
      content: { type: Sequelize.TEXT, allowNull: true },
      attachments: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      token_estimate: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      metadata: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    await queryInterface.addIndex("assistant_chat_messages", ["chat_id", "created_at"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("assistant_chat_messages");
    await queryInterface.dropTable("assistant_chats");
  },
};
