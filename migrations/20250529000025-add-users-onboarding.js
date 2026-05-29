"use strict";

const DEFAULT_ONBOARDING = {
  status: "pending",
  step: 0,
  version: 1,
  completed_at: null,
};

const COMPLETED_ONBOARDING = {
  status: "completed",
  step: 0,
  version: 1,
  completed_at: null,
};

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("users", "onboarding", {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: DEFAULT_ONBOARDING,
    });

    await queryInterface.sequelize.query(`
      UPDATE users
      SET onboarding = '${JSON.stringify(COMPLETED_ONBOARDING)}'::jsonb
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("users", "onboarding");
  },
};
