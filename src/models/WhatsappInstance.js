const { Model, DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  class WhatsappInstance extends Model {
    static associate(models) {
      WhatsappInstance.belongsTo(models.Tenant, { foreignKey: "tenant_id", as: "tenant" });
      WhatsappInstance.hasMany(models.RagConversation, {
        foreignKey: "whatsapp_instance_id",
        as: "conversations",
      });
    }
  }

  WhatsappInstance.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      tenant_id: { type: DataTypes.UUID, allowNull: false },
      instance_name: { type: DataTypes.STRING(120), allowNull: false },
      provider: { type: DataTypes.STRING(40), allowNull: false, defaultValue: "evolution" },
      evolution_base_url: { type: DataTypes.STRING(500), allowNull: true },
      chatwoot_account_id: { type: DataTypes.STRING(40), allowNull: true },
      chatwoot_inbox_id: { type: DataTypes.STRING(40), allowNull: true },
      chatwoot_url: { type: DataTypes.STRING(500), allowNull: true },
      connection_state: { type: DataTypes.STRING(30), allowNull: false, defaultValue: "unknown" },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      settings: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    },
    {
      sequelize,
      modelName: "WhatsappInstance",
      tableName: "whatsapp_instances",
      underscored: true,
    }
  );

  return WhatsappInstance;
};
