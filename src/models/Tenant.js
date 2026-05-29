const { Model, DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  class Tenant extends Model {
    static associate(models) {
      Tenant.hasMany(models.User, { foreignKey: "tenant_id", as: "users" });
      Tenant.hasMany(models.Client, { foreignKey: "tenant_id", as: "clients" });
      Tenant.hasMany(models.Project, { foreignKey: "tenant_id", as: "projects" });
    }
  }

  Tenant.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: { type: DataTypes.STRING(200), allowNull: false },
      slug: { type: DataTypes.STRING(220), allowNull: false, unique: true },
      plan: { type: DataTypes.STRING(50), allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      settings: { type: DataTypes.JSONB, allowNull: true, defaultValue: {} },
    },
    { sequelize, modelName: "Tenant", tableName: "tenants", underscored: true }
  );

  return Tenant;
};
