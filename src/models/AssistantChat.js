const { Model, DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  class AssistantChat extends Model {
    static associate(models) {
      AssistantChat.belongsTo(models.User, { foreignKey: "user_id", as: "user" });
      AssistantChat.belongsTo(models.Project, { foreignKey: "project_id", as: "project" });
      AssistantChat.hasMany(models.AssistantChatMessage, {
        foreignKey: "chat_id",
        as: "messages",
        onDelete: "CASCADE",
      });
    }
  }

  AssistantChat.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      tenant_id: { type: DataTypes.UUID, allowNull: false },
      user_id: { type: DataTypes.UUID, allowNull: false },
      project_id: { type: DataTypes.UUID, allowNull: true },
      title: { type: DataTypes.STRING(300), allowNull: true },
      system_instructions: { type: DataTypes.TEXT, allowNull: true },
      model: { type: DataTypes.STRING(120), allowNull: true },
      settings: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      message_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      last_message_at: { type: DataTypes.DATE, allowNull: true },
    },
    { sequelize, modelName: "AssistantChat", tableName: "assistant_chats", underscored: true }
  );

  return AssistantChat;
};
