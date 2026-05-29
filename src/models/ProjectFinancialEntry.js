const { Model, DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  class ProjectFinancialEntry extends Model {
    static associate(models) {
      ProjectFinancialEntry.belongsTo(models.Project, {
        foreignKey: "project_id",
        as: "project",
      });
    }
  }

  ProjectFinancialEntry.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      project_id: { type: DataTypes.UUID, allowNull: false },
      entry_type: {
        type: DataTypes.ENUM(
          "entrada",
          "adiantamento",
          "sprint",
          "parcela",
          "final",
          "outro"
        ),
        allowNull: false,
        defaultValue: "entrada",
      },
      amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      title: {
        type: DataTypes.STRING(300),
        allowNull: false,
        validate: { notEmpty: true },
      },
      description: { type: DataTypes.TEXT, allowNull: true },
      entry_date: { type: DataTypes.DATEONLY, allowNull: false },
    },
    {
      sequelize,
      modelName: "ProjectFinancialEntry",
      tableName: "project_financial_entries",
      underscored: true,
    }
  );

  return ProjectFinancialEntry;
};
