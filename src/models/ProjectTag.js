const { Model, DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  class ProjectTag extends Model {}

  ProjectTag.init(
    {
      project_id: { type: DataTypes.UUID, primaryKey: true },
      tag_id: { type: DataTypes.UUID, primaryKey: true },
    },
    { sequelize, modelName: "ProjectTag", tableName: "project_tags", underscored: true, timestamps: true, updatedAt: false }
  );

  return ProjectTag;
};
