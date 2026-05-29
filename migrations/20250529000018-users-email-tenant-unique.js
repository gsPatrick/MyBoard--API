"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
    `);

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS users_email_tenant_unique
      ON users (email, tenant_id)
      WHERE tenant_id IS NOT NULL;
    `);

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS users_email_super_admin_unique
      ON users (email)
      WHERE tenant_id IS NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS users_email_tenant_unique;`);
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS users_email_super_admin_unique;`);
    await queryInterface.addIndex("users", ["email"], { unique: true, name: "users_email_key" });
  },
};
