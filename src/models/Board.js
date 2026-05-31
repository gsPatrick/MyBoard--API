const { Model, DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  class Board extends Model {
    static associate(models) {
      Board.belongsTo(models.Project, {
        foreignKey: "project_id",
        as: "project",
      });
      Board.belongsTo(models.User, {
        foreignKey: "created_by_user_id",
        as: "createdBy",
      });
    }
  }

  Board.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      tenant_id: { type: DataTypes.UUID, allowNull: false },
      project_id: { type: DataTypes.UUID, allowNull: true },
      name: {
        type: DataTypes.STRING(200),
        allowNull: false,
        validate: { notEmpty: true },
      },
      scene_data: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: { elements: [], appState: {}, files: {} },
      },
      is_default: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      created_by_user_id: { type: DataTypes.UUID, allowNull: true },
    },
    {
      sequelize,
      modelName: "Board",
      tableName: "boards",
      underscored: true,
    }
  );

  return Board;
};
