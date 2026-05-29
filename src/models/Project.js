const { Model, DataTypes } = require("sequelize");
const { PROJECT_STATUSES, PROJECT_PRIORITIES, IMPORTANCE_LEVELS } = require("../config/constants");

module.exports = (sequelize) => {
  class Project extends Model {
    static associate(models) {
      Project.belongsTo(models.Tenant, { foreignKey: "tenant_id", as: "tenant" });

      Project.belongsTo(models.Client, {
        foreignKey: "client_id",
        as: "client",
      });

      Project.belongsTo(models.WorkspaceFolder, {
        foreignKey: "folder_id",
        as: "folder",
      });

      Project.hasMany(models.ProjectDetail, {
        foreignKey: "project_id",
        as: "details",
      });

      Project.belongsToMany(models.Tag, {
        through: models.ProjectTag,
        foreignKey: "project_id",
        otherKey: "tag_id",
        as: "tags",
      });

      Project.belongsTo(models.MediaFile, {
        foreignKey: "cover_media_id",
        as: "cover",
      });

      Project.hasMany(models.AgendaEvent, {
        foreignKey: "project_id",
        as: "agendaEvents",
      });

      Project.hasMany(models.ProjectDemand, {
        foreignKey: "project_id",
        as: "demands",
      });
    }
  }

  Project.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      tenant_id: { type: DataTypes.UUID, allowNull: false },
      client_id: { type: DataTypes.UUID, allowNull: false },
      folder_id: { type: DataTypes.UUID, allowNull: true },
      workspace_sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      name: {
        type: DataTypes.STRING(200),
        allowNull: false,
        validate: { notEmpty: true, len: [2, 200] },
      },
      slug: { type: DataTypes.STRING(220), allowNull: false, unique: true },
      description: { type: DataTypes.TEXT, allowNull: true },
      status: {
        type: DataTypes.ENUM(...PROJECT_STATUSES),
        allowNull: false,
        defaultValue: "in_progress",
      },
      has_deadline: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      priority: {
        type: DataTypes.ENUM(...PROJECT_PRIORITIES),
        allowNull: false,
        defaultValue: "medium",
      },
      importance_level: {
        type: DataTypes.ENUM(...IMPORTANCE_LEVELS),
        allowNull: false,
        defaultValue: "normal",
      },
      is_hidden: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      icon: { type: DataTypes.STRING(50), allowNull: true, defaultValue: "file-code" },
      color: { type: DataTypes.STRING(20), allowNull: true, defaultValue: "#3b82f6" },
      cover_media_id: { type: DataTypes.UUID, allowNull: true },
      start_date: { type: DataTypes.DATEONLY, allowNull: true },
      due_date: { type: DataTypes.DATEONLY, allowNull: true },
      budget: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
    },
    {
      sequelize,
      modelName: "Project",
      tableName: "projects",
      underscored: true,
    }
  );

  return Project;
};
