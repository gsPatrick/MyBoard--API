const { Model, DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  class WorkspaceFolder extends Model {
    static associate(models) {
      WorkspaceFolder.belongsTo(models.WorkspaceFolder, {
        foreignKey: "parent_id",
        as: "parent",
      });

      WorkspaceFolder.hasMany(models.WorkspaceFolder, {
        foreignKey: "parent_id",
        as: "children",
      });

      WorkspaceFolder.belongsTo(models.Client, {
        foreignKey: "client_id",
        as: "client",
      });

      WorkspaceFolder.hasMany(models.Project, {
        foreignKey: "folder_id",
        as: "projects",
      });
    }
  }

  WorkspaceFolder.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      parent_id: { type: DataTypes.UUID, allowNull: true },
      client_id: { type: DataTypes.UUID, allowNull: true },
      name: { type: DataTypes.STRING(200), allowNull: false },
      slug: { type: DataTypes.STRING(220), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      color: { type: DataTypes.STRING(20), allowNull: true, defaultValue: "#8b5cf6" },
      icon: { type: DataTypes.STRING(50), allowNull: true, defaultValue: "folder" },
      sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      is_hidden: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    { sequelize, modelName: "WorkspaceFolder", tableName: "workspace_folders", underscored: true }
  );

  return WorkspaceFolder;
};
