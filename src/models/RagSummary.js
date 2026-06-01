const { Model, DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  class RagSummary extends Model {
    static associate(models) {
      RagSummary.belongsTo(models.Tenant, { foreignKey: "tenant_id", as: "tenant" });
      RagSummary.belongsTo(models.RagConversation, {
        foreignKey: "conversation_id",
        as: "conversation",
      });
    }
  }

  RagSummary.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      tenant_id: { type: DataTypes.UUID, allowNull: false },
      conversation_id: { type: DataTypes.UUID, allowNull: true },
      client_id: { type: DataTypes.UUID, allowNull: true },
      project_id: { type: DataTypes.UUID, allowNull: true },
      level: {
        type: DataTypes.ENUM("message_window", "daily", "weekly", "thread", "project", "client"),
        allowNull: false,
      },
      period_start: { type: DataTypes.DATE, allowNull: true },
      period_end: { type: DataTypes.DATE, allowNull: true },
      content: { type: DataTypes.TEXT, allowNull: false },
      token_estimate: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      source_chunk_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    },
    {
      sequelize,
      modelName: "RagSummary",
      tableName: "rag_summaries",
      underscored: true,
    }
  );

  return RagSummary;
};
