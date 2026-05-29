const { Model, DataTypes } = require("sequelize");
const { CLIENT_STATUSES, IMPORTANCE_LEVELS } = require("../config/constants");

module.exports = (sequelize) => {
  class Client extends Model {
    static associate(models) {
      Client.belongsTo(models.Tenant, { foreignKey: "tenant_id", as: "tenant" });

      Client.hasMany(models.Project, {
        foreignKey: "client_id",
        as: "projects",
      });

      Client.hasMany(models.WorkspaceFolder, {
        foreignKey: "client_id",
        as: "folders",
      });

      Client.belongsToMany(models.Tag, {
        through: models.ClientTag,
        foreignKey: "client_id",
        otherKey: "tag_id",
        as: "tags",
      });

      Client.belongsTo(models.MediaFile, {
        foreignKey: "avatar_media_id",
        as: "avatar",
      });

      Client.hasMany(models.AgendaEvent, {
        foreignKey: "client_id",
        as: "agendaEvents",
      });
    }
  }

  Client.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      tenant_id: { type: DataTypes.UUID, allowNull: false },
      name: {
        type: DataTypes.STRING(200),
        allowNull: false,
        validate: { notEmpty: true, len: [2, 200] },
      },
      email: {
        type: DataTypes.STRING(255),
        allowNull: true,
        validate: { isEmail: true },
      },
      company: { type: DataTypes.STRING(200), allowNull: true },
      phone: { type: DataTypes.STRING(50), allowNull: true },
      document: { type: DataTypes.STRING(50), allowNull: true },
      status: {
        type: DataTypes.ENUM(...CLIENT_STATUSES),
        allowNull: false,
        defaultValue: "active",
      },
      importance_level: {
        type: DataTypes.ENUM(...IMPORTANCE_LEVELS),
        allowNull: false,
        defaultValue: "normal",
      },
      is_hidden: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      avatar_media_id: { type: DataTypes.UUID, allowNull: true },
      notes: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      sequelize,
      modelName: "Client",
      tableName: "clients",
      underscored: true,
    }
  );

  return Client;
};
