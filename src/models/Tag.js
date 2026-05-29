const { Model, DataTypes } = require("sequelize");
const { TAG_SCOPES } = require("../config/constants");

module.exports = (sequelize) => {
  class Tag extends Model {
    static associate(models) {
      Tag.belongsToMany(models.Client, {
        through: models.ClientTag,
        foreignKey: "tag_id",
        otherKey: "client_id",
        as: "clients",
      });

      Tag.belongsToMany(models.Project, {
        through: models.ProjectTag,
        foreignKey: "tag_id",
        otherKey: "project_id",
        as: "projects",
      });
    }
  }

  Tag.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: { type: DataTypes.STRING(80), allowNull: false },
      slug: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      color: { type: DataTypes.STRING(20), allowNull: true, defaultValue: "#6366f1" },
      scope: { type: DataTypes.ENUM(...TAG_SCOPES), allowNull: false, defaultValue: "both" },
      importance_weight: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    },
    { sequelize, modelName: "Tag", tableName: "tags", underscored: true }
  );

  return Tag;
};
