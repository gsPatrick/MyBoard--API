const { Model, DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  class ClientTag extends Model {}

  ClientTag.init(
    {
      client_id: { type: DataTypes.UUID, primaryKey: true },
      tag_id: { type: DataTypes.UUID, primaryKey: true },
    },
    { sequelize, modelName: "ClientTag", tableName: "client_tags", underscored: true, timestamps: true, updatedAt: false }
  );

  return ClientTag;
};
