const { Model, DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  class UserActivity extends Model {
    static associate(models) {
      UserActivity.belongsTo(models.Tenant, { foreignKey: "tenant_id", as: "tenant" });
      UserActivity.belongsTo(models.User, { foreignKey: "user_id", as: "user" });
    }
  }

  UserActivity.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      tenant_id: { type: DataTypes.UUID, allowNull: true },
      user_id: { type: DataTypes.UUID, allowNull: false },
      action_type: { type: DataTypes.STRING(80), allowNull: false },
      title: { type: DataTypes.STRING(500), allowNull: false },
      entity_type: { type: DataTypes.STRING(50), allowNull: true },
      entity_id: { type: DataTypes.UUID, allowNull: true },
      payload: { type: DataTypes.JSONB, allowNull: true, defaultValue: {} },
    },
    { sequelize, modelName: "UserActivity", tableName: "user_activities", underscored: true }
  );

  return UserActivity;
};
