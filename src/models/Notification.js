const { Model, DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  class Notification extends Model {
    static associate(models) {
      Notification.belongsTo(models.User, {
        foreignKey: "user_id",
        as: "user",
      });
    }
  }

  Notification.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      user_id: { type: DataTypes.UUID, allowNull: false },
      event_type: { type: DataTypes.STRING(80), allowNull: false },
      title: { type: DataTypes.STRING(300), allowNull: false },
      message: { type: DataTypes.TEXT, allowNull: true },
      payload: { type: DataTypes.JSONB, allowNull: true, defaultValue: {} },
      entity_type: { type: DataTypes.STRING(50), allowNull: true },
      entity_id: { type: DataTypes.UUID, allowNull: true },
      read_at: { type: DataTypes.DATE, allowNull: true },
      is_hidden: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    { sequelize, modelName: "Notification", tableName: "notifications", underscored: true }
  );

  return Notification;
};
