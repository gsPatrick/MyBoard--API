const { Model, DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  class AssistantChatMessage extends Model {
    static associate(models) {
      AssistantChatMessage.belongsTo(models.AssistantChat, { foreignKey: "chat_id", as: "chat" });
    }
  }

  AssistantChatMessage.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      tenant_id: { type: DataTypes.UUID, allowNull: false },
      chat_id: { type: DataTypes.UUID, allowNull: false },
      role: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "user" },
      content: { type: DataTypes.TEXT, allowNull: true },
      attachments: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      token_estimate: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    },
    {
      sequelize,
      modelName: "AssistantChatMessage",
      tableName: "assistant_chat_messages",
      underscored: true,
    }
  );

  return AssistantChatMessage;
};
