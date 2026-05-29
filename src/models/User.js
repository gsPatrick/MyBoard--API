const { Model, DataTypes } = require("sequelize");
const { USER_ROLES } = require("../config/constants");

module.exports = (sequelize) => {
  class User extends Model {
    static associate(models) {
      User.belongsTo(models.Tenant, { foreignKey: "tenant_id", as: "tenant" });

      User.belongsTo(models.MediaFile, {
        foreignKey: "avatar_media_id",
        as: "avatar",
      });

      User.hasMany(models.Notification, {
        foreignKey: "user_id",
        as: "notifications",
      });

      User.hasMany(models.UserActivity, {
        foreignKey: "user_id",
        as: "activities",
      });

      User.hasMany(models.MediaFile, {
        foreignKey: "uploaded_by_user_id",
        as: "uploads",
      });

      User.hasMany(models.PasswordResetToken, {
        foreignKey: "user_id",
        as: "passwordResetTokens",
      });
    }

    toSafeJSON() {
      const json = this.toJSON();
      delete json.password_hash;
      return json;
    }
  }

  User.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      tenant_id: { type: DataTypes.UUID, allowNull: true },
      name: { type: DataTypes.STRING(200), allowNull: false },
      email: { type: DataTypes.STRING(255), allowNull: false },
      password_hash: { type: DataTypes.STRING(255), allowNull: true },
      role: { type: DataTypes.ENUM(...USER_ROLES), allowNull: false, defaultValue: "developer" },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      is_hidden: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      avatar_media_id: { type: DataTypes.UUID, allowNull: true },
      onboarding: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {
          status: "pending",
          step: 0,
          version: 1,
          completed_at: null,
        },
      },
    },
    {
      sequelize,
      modelName: "User",
      tableName: "users",
      underscored: true,
      defaultScope: {
        attributes: { exclude: ["password_hash"] },
      },
      scopes: {
        withPassword: { attributes: {} },
      },
    }
  );

  return User;
};
