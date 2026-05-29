"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("projects", "workspace_sort_order", {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    await queryInterface.addIndex("projects", ["folder_id", "workspace_sort_order"]);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("projects", ["folder_id", "workspace_sort_order"]);
    await queryInterface.removeColumn("projects", "workspace_sort_order");
  },
};
