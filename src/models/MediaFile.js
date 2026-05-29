const { Model, DataTypes } = require("sequelize");
const { MEDIA_ENTITY_TYPES, MEDIA_KINDS, STORAGE_DISKS } = require("../config/constants");

module.exports = (sequelize) => {
  class MediaFile extends Model {
    static associate(models) {
      MediaFile.belongsTo(models.User, {
        foreignKey: "uploaded_by_user_id",
        as: "uploadedBy",
      });
    }
  }

  MediaFile.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      entity_type: { type: DataTypes.ENUM(...MEDIA_ENTITY_TYPES), allowNull: false },
      entity_id: { type: DataTypes.UUID, allowNull: false },
      kind: { type: DataTypes.ENUM(...MEDIA_KINDS), allowNull: false, defaultValue: "attachment" },
      original_name: { type: DataTypes.STRING(500), allowNull: false },
      stored_name: { type: DataTypes.STRING(500), allowNull: false },
      mime_type: { type: DataTypes.STRING(150), allowNull: false },
      size_bytes: { type: DataTypes.BIGINT, allowNull: false },
      storage_disk: { type: DataTypes.ENUM(...STORAGE_DISKS), allowNull: false, defaultValue: "local" },
      storage_path: { type: DataTypes.STRING(1000), allowNull: false },
      public_url: { type: DataTypes.STRING(1000), allowNull: true },
      uploaded_by_user_id: { type: DataTypes.UUID, allowNull: true },
      metadata: { type: DataTypes.JSONB, allowNull: true, defaultValue: {} },
    },
    { sequelize, modelName: "MediaFile", tableName: "media_files", underscored: true }
  );

  return MediaFile;
};
