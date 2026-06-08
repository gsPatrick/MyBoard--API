const { Model, DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  class UserSession extends Model {
    static associate(models) {
      UserSession.belongsTo(models.User, { foreignKey: "user_id", as: "user" });
    }
  }

  UserSession.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      user_id: { type: DataTypes.UUID, allowNull: false },
      // identificador único da sessão, embutido no JWT (claim `jti`)
      jti: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      // web | macos | windows
      platform: { type: DataTypes.STRING(16), allowNull: false, defaultValue: "web" },
      client_name: { type: DataTypes.STRING(120), allowNull: true },
      browser: { type: DataTypes.STRING(60), allowNull: true },
      os: { type: DataTypes.STRING(60), allowNull: true },
      user_agent: { type: DataTypes.TEXT, allowNull: true },
      ip_address: { type: DataTypes.STRING(64), allowNull: true },
      last_seen_at: { type: DataTypes.DATE, allowNull: true },
      revoked_at: { type: DataTypes.DATE, allowNull: true },
    },
    { sequelize, modelName: "UserSession", tableName: "user_sessions", underscored: true }
  );

  return UserSession;
};
