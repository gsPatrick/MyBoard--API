const { Model, DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  class ProjectWhatsappLink extends Model {
    static associate(models) {
      ProjectWhatsappLink.belongsTo(models.Tenant, { foreignKey: "tenant_id", as: "tenant" });
      ProjectWhatsappLink.belongsTo(models.Project, { foreignKey: "project_id", as: "project" });
    }
  }

  ProjectWhatsappLink.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      tenant_id: { type: DataTypes.UUID, allowNull: false },
      project_id: { type: DataTypes.UUID, allowNull: false },
      link_type: { type: DataTypes.ENUM("phone", "group"), allowNull: false },
      external_id: { type: DataTypes.STRING(120), allowNull: false },
      display_name: { type: DataTypes.STRING(200), allowNull: true },
      whatsapp_jid: { type: DataTypes.STRING(120), allowNull: true },
      metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    },
    {
      sequelize,
      modelName: "ProjectWhatsappLink",
      tableName: "project_whatsapp_links",
      underscored: true,
    }
  );

  return ProjectWhatsappLink;
};
