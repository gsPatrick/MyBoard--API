const { Model, DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  class RagChunk extends Model {
    static associate(models) {
      RagChunk.belongsTo(models.Tenant, { foreignKey: "tenant_id", as: "tenant" });
      RagChunk.belongsTo(models.RagConversation, {
        foreignKey: "conversation_id",
        as: "conversation",
      });
    }
  }

  RagChunk.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      tenant_id: { type: DataTypes.UUID, allowNull: false },
      conversation_id: { type: DataTypes.UUID, allowNull: false },
      client_id: { type: DataTypes.UUID, allowNull: true },
      project_id: { type: DataTypes.UUID, allowNull: true },
      channel: {
        type: DataTypes.ENUM("whatsapp", "chatwoot", "in_app", "manual", "workspace"),
        allowNull: false,
      },
      source_type: {
        type: DataTypes.ENUM(
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
      chunk_index: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      content: { type: DataTypes.TEXT, allowNull: false },
      content_hash: { type: DataTypes.STRING(64), allowNull: true },
      token_estimate: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      message_ids: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      period_start: { type: DataTypes.DATE, allowNull: true },
      period_end: { type: DataTypes.DATE, allowNull: true },
      embedding_model: { type: DataTypes.STRING(120), allowNull: true },
      embedding: { type: DataTypes.JSONB, allowNull: true },
      metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    },
    {
      sequelize,
      modelName: "RagChunk",
      tableName: "rag_chunks",
      underscored: true,
    }
  );

  return RagChunk;
};
