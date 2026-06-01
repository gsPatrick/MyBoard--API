const { Model, DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  class RagMessage extends Model {
    static associate(models) {
      RagMessage.belongsTo(models.Tenant, { foreignKey: "tenant_id", as: "tenant" });
      RagMessage.belongsTo(models.RagConversation, {
        foreignKey: "conversation_id",
        as: "conversation",
      });
    }
  }

  RagMessage.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      tenant_id: { type: DataTypes.UUID, allowNull: false },
      conversation_id: { type: DataTypes.UUID, allowNull: false },
      external_message_id: { type: DataTypes.STRING(200), allowNull: false },
      direction: {
        type: DataTypes.ENUM("inbound", "outbound", "system"),
        allowNull: false,
        defaultValue: "inbound",
      },
      sender_id: { type: DataTypes.STRING(120), allowNull: true },
      sender_name: { type: DataTypes.STRING(200), allowNull: true },
      content_type: {
        type: DataTypes.ENUM("text", "audio", "image", "video", "document", "location", "reaction", "other"),
        allowNull: false,
        defaultValue: "text",
      },
      body_text: { type: DataTypes.TEXT, allowNull: true },
      body_normalized: { type: DataTypes.TEXT, allowNull: true },
      token_estimate: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      sent_at: { type: DataTypes.DATE, allowNull: false },
      raw_payload: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      storage_optimized: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      content_hash: { type: DataTypes.STRING(64), allowNull: true },
    },
    {
      sequelize,
      modelName: "RagMessage",
      tableName: "rag_messages",
      underscored: true,
    }
  );

  return RagMessage;
};
