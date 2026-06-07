const { Model, DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  class UserPasskey extends Model {
    static associate(models) {
      UserPasskey.belongsTo(models.User, { foreignKey: "user_id", as: "user" });
    }
  }

  UserPasskey.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      user_id: { type: DataTypes.UUID, allowNull: false },
      credential_id: { type: DataTypes.STRING(512), allowNull: false, unique: true },
      public_key: { type: DataTypes.TEXT, allowNull: false },
      counter: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
      transports: { type: DataTypes.STRING(255), allowNull: true },
      device_type: { type: DataTypes.STRING(32), allowNull: true },
      backed_up: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      name: { type: DataTypes.STRING(120), allowNull: true },
      last_used_at: { type: DataTypes.DATE, allowNull: true },
    },
    { sequelize, modelName: "UserPasskey", tableName: "user_passkeys", underscored: true }
  );

  return UserPasskey;
};
