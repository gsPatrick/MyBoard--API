const { Model, DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  class ClientWhatsappLink extends Model {
    static associate(models) {
      ClientWhatsappLink.belongsTo(models.Tenant, { foreignKey: "tenant_id", as: "tenant" });
      ClientWhatsappLink.belongsTo(models.Client, { foreignKey: "client_id", as: "client" });
    }
  }

  ClientWhatsappLink.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      tenant_id: { type: DataTypes.UUID, allowNull: false },
      client_id: { type: DataTypes.UUID, allowNull: false },
      phone_e164: { type: DataTypes.STRING(20), allowNull: false },
      phone_digits: { type: DataTypes.STRING(20), allowNull: false },
      label: { type: DataTypes.STRING(120), allowNull: true },
      is_primary: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      whatsapp_jid: { type: DataTypes.STRING(80), allowNull: true },
      metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    },
    {
      sequelize,
      modelName: "ClientWhatsappLink",
      tableName: "client_whatsapp_links",
      underscored: true,
    }
  );

  return ClientWhatsappLink;
};
