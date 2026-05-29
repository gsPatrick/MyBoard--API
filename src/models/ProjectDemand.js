const { Model, DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  class ProjectDemand extends Model {
    static associate(models) {
      ProjectDemand.belongsTo(models.Project, {
        foreignKey: "project_id",
        as: "project",
      });
    }
  }

  ProjectDemand.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      project_id: { type: DataTypes.UUID, allowNull: false },
      title: {
        type: DataTypes.STRING(300),
        allowNull: false,
        validate: { notEmpty: true },
      },
      description: { type: DataTypes.TEXT, allowNull: true },
      status: {
        type: DataTypes.ENUM("pending", "in_progress", "done", "cancelled"),
        allowNull: false,
        defaultValue: "pending",
      },
      sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      completed_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      sequelize,
      modelName: "ProjectDemand",
      tableName: "project_demands",
      underscored: true,
    }
  );

  return ProjectDemand;
};
