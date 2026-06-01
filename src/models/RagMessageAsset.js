const { Model, DataTypes } = require("sequelize");

const ASSET_TYPES = ["document", "audio", "image", "video", "other"];

module.exports = (sequelize) => {
  class RagMessageAsset extends Model {
    static associate(models) {
      RagMessageAsset.belongsTo(models.Tenant, { foreignKey: "tenant_id", as: "tenant" });
      RagMessageAsset.belongsTo(models.RagMessage, { foreignKey: "message_id", as: "message" });
      RagMessageAsset.belongsTo(models.RagConversation, { foreignKey: "conversation_id", as: "conversation" });
      RagMessageAsset.belongsTo(models.MediaFile, { foreignKey: "media_file_id", as: "mediaFile" });
      RagMessageAsset.belongsTo(models.Client, { foreignKey: "client_id", as: "client" });
      RagMessageAsset.belongsTo(models.Project, { foreignKey: "project_id", as: "project" });
    }
  }

  RagMessageAsset.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      tenant_id: { type: DataTypes.UUID, allowNull: false },
      message_id: { type: DataTypes.UUID, allowNull: false },
      conversation_id: { type: DataTypes.UUID, allowNull: false },
      client_id: { type: DataTypes.UUID, allowNull: true },
      project_id: { type: DataTypes.UUID, allowNull: true },
      media_file_id: { type: DataTypes.UUID, allowNull: true },
      asset_type: { type: DataTypes.ENUM(...ASSET_TYPES), allowNull: false },
      original_name: { type: DataTypes.STRING(500), allowNull: true },
      mime_type: { type: DataTypes.STRING(150), allowNull: true },
      extracted_text: { type: DataTypes.TEXT, allowNull: true },
      token_estimate: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      is_contract: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    },
    { sequelize, modelName: "RagMessageAsset", tableName: "rag_message_assets", underscored: true }
  );

  RagMessageAsset.ASSET_TYPES = ASSET_TYPES;
  return RagMessageAsset;
};
