const { Model, DataTypes } = require("sequelize");
const { DETAIL_CATEGORIES, DETAIL_VALUE_TYPES } = require("../config/constants");

module.exports = (sequelize) => {
  class ProjectDetail extends Model {
    static associate(models) {
      ProjectDetail.belongsTo(models.Project, {
        foreignKey: "project_id",
        as: "project",
      });
    }
  }

  ProjectDetail.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      project_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      category: {
        type: DataTypes.ENUM(...DETAIL_CATEGORIES),
        allowNull: false,
        defaultValue: "custom",
      },
      key: {
        type: DataTypes.STRING(120),
        allowNull: false,
        validate: {
          notEmpty: true,
        },
      },
      label: {
        type: DataTypes.STRING(200),
        allowNull: false,
        validate: {
          notEmpty: true,
        },
      },
      value_type: {
        type: DataTypes.ENUM(...DETAIL_VALUE_TYPES),
        allowNull: false,
        defaultValue: "text",
      },
      value_text: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      value_json: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      is_secret: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
      },
    },
    {
      sequelize,
      modelName: "ProjectDetail",
      tableName: "project_details",
      underscored: true,
    }
  );

  return ProjectDetail;
};
