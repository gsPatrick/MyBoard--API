"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_slug_key;
    `);

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS tags_tenant_slug_unique
      ON tags (tenant_id, slug)
      WHERE tenant_id IS NOT NULL;
    `);

    await queryInterface.bulkDelete("tags", { tenant_id: null });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS tags_tenant_slug_unique;`);
    await queryInterface.addIndex("tags", ["slug"], { unique: true, name: "tags_slug_key" });
  },
};
