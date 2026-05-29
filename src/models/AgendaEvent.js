const { Model, DataTypes } = require("sequelize");
const { AGENDA_STATUSES, APP_TIMEZONE } = require("../config/constants");

module.exports = (sequelize) => {
  class AgendaEvent extends Model {
    static associate(models) {
      AgendaEvent.belongsTo(models.Client, { foreignKey: "client_id", as: "client" });
      AgendaEvent.belongsTo(models.Project, { foreignKey: "project_id", as: "project" });
      AgendaEvent.belongsTo(models.User, { foreignKey: "created_by_user_id", as: "createdBy" });
    }
  }

  AgendaEvent.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      title: { type: DataTypes.STRING(300), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      starts_at: { type: DataTypes.DATE, allowNull: false },
      ends_at: { type: DataTypes.DATE, allowNull: true },
      timezone: { type: DataTypes.STRING(80), allowNull: false, defaultValue: APP_TIMEZONE },
      all_day: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      client_id: { type: DataTypes.UUID, allowNull: true },
      project_id: { type: DataTypes.UUID, allowNull: true },
      created_by_user_id: { type: DataTypes.UUID, allowNull: true },
      reminder_minutes_before: { type: DataTypes.INTEGER, allowNull: true },
      status: { type: DataTypes.ENUM(...AGENDA_STATUSES), allowNull: false, defaultValue: "scheduled" },
      is_hidden: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      metadata: { type: DataTypes.JSONB, allowNull: true, defaultValue: {} },
    },
    { sequelize, modelName: "AgendaEvent", tableName: "agenda_events", underscored: true }
  );

  return AgendaEvent;
};
