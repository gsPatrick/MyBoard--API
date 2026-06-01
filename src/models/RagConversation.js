const { Model, DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  class RagConversation extends Model {
    static associate(models) {
      RagConversation.belongsTo(models.Tenant, { foreignKey: "tenant_id", as: "tenant" });
      RagConversation.belongsTo(models.WhatsappInstance, {
        foreignKey: "whatsapp_instance_id",
        as: "whatsappInstance",
      });
      RagConversation.belongsTo(models.Client, { foreignKey: "client_id", as: "client" });
      RagConversation.belongsTo(models.Project, { foreignKey: "project_id", as: "project" });
      RagConversation.hasMany(models.RagMessage, {
        foreignKey: "conversation_id",
        as: "messages",
      });
      RagConversation.hasMany(models.RagChunk, {
        foreignKey: "conversation_id",
        as: "chunks",
      });
      RagConversation.hasMany(models.RagSummary, {
        foreignKey: "conversation_id",
        as: "summaries",
      });
    }
  }

  RagConversation.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      tenant_id: { type: DataTypes.UUID, allowNull: false },
      channel: {
        type: DataTypes.ENUM("whatsapp", "chatwoot", "in_app", "manual", "workspace"),
        allowNull: false,
      },
      external_thread_id: { type: DataTypes.STRING(200), allowNull: false },
      whatsapp_instance_id: { type: DataTypes.UUID, allowNull: true },
      client_id: { type: DataTypes.UUID, allowNull: true },
      project_id: { type: DataTypes.UUID, allowNull: true },
      title: { type: DataTypes.STRING(300), allowNull: true },
      participant_label: { type: DataTypes.STRING(200), allowNull: true },
      is_group: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      message_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      token_estimate: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
      last_message_at: { type: DataTypes.DATE, allowNull: true },
      metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    },
    {
      sequelize,
      modelName: "RagConversation",
      tableName: "rag_conversations",
      underscored: true,
    }
  );

  return RagConversation;
};
