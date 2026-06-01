const { Model, DataTypes } = require("sequelize");

const FACT_TYPES = [
  "deal_value",
  "deal_date",
  "contract",
  "payment",
  "deadline",
  "contact",
  "decision",
  "scope",
  "document",
  "other",
];

module.exports = (sequelize) => {
  class RagFact extends Model {
    static associate(models) {
      RagFact.belongsTo(models.Tenant, { foreignKey: "tenant_id", as: "tenant" });
      RagFact.belongsTo(models.Client, { foreignKey: "client_id", as: "client" });
      RagFact.belongsTo(models.Project, { foreignKey: "project_id", as: "project" });
      RagFact.belongsTo(models.RagConversation, { foreignKey: "conversation_id", as: "conversation" });
      RagFact.belongsTo(models.RagMessage, { foreignKey: "message_id", as: "message" });
    }
  }

  RagFact.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      tenant_id: { type: DataTypes.UUID, allowNull: false },
      client_id: { type: DataTypes.UUID, allowNull: true },
      project_id: { type: DataTypes.UUID, allowNull: true },
      conversation_id: { type: DataTypes.UUID, allowNull: true },
      message_id: { type: DataTypes.UUID, allowNull: true },
      fact_type: { type: DataTypes.ENUM(...FACT_TYPES), allowNull: false },
      fact_key: { type: DataTypes.STRING(120), allowNull: false, defaultValue: "primary" },
      label: { type: DataTypes.STRING(300), allowNull: true },
      value_text: { type: DataTypes.TEXT, allowNull: true },
      value_number: { type: DataTypes.DECIMAL(16, 2), allowNull: true },
      value_date: { type: DataTypes.DATE, allowNull: true },
      value_json: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      confidence: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0.7 },
      source_channel: { type: DataTypes.STRING(40), allowNull: true },
      source_excerpt: { type: DataTypes.TEXT, allowNull: true },
      metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    },
    { sequelize, modelName: "RagFact", tableName: "rag_facts", underscored: true }
  );

  RagFact.FACT_TYPES = FACT_TYPES;
  return RagFact;
};
