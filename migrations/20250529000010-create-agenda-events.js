"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("agenda_events", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      title: {
        type: Sequelize.STRING(300),
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      starts_at: {
        type: Sequelize.DATE,
        allowNull: false,
        comment: "Armazenado em UTC; exibido em America/Sao_Paulo",
      },
      ends_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      timezone: {
        type: Sequelize.STRING(80),
        allowNull: false,
        defaultValue: "America/Sao_Paulo",
      },
      all_day: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      client_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "clients", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      project_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "projects", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      created_by_user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      reminder_minutes_before: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM("scheduled", "completed", "cancelled"),
        allowNull: false,
        defaultValue: "scheduled",
      },
      is_hidden: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.addIndex("agenda_events", ["starts_at"]);
    await queryInterface.addIndex("agenda_events", ["client_id"]);
    await queryInterface.addIndex("agenda_events", ["project_id"]);
    await queryInterface.addIndex("agenda_events", ["status"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("agenda_events");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_agenda_events_status";');
  },
};
