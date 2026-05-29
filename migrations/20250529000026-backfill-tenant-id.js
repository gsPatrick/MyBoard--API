"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const [[fallbackRow]] = await queryInterface.sequelize.query(`
      SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1;
    `);

    const fallbackTenantId = fallbackRow?.id;
    if (!fallbackTenantId) {
      return;
    }

    await queryInterface.sequelize.query(
      `
      UPDATE clients
      SET tenant_id = :tenantId
      WHERE tenant_id IS NULL;
    `,
      { replacements: { tenantId: fallbackTenantId } }
    );

    await queryInterface.sequelize.query(
      `
      UPDATE projects p
      SET tenant_id = COALESCE(c.tenant_id, :tenantId)
      FROM clients c
      WHERE p.client_id = c.id
        AND p.tenant_id IS NULL;
    `,
      { replacements: { tenantId: fallbackTenantId } }
    );

    await queryInterface.sequelize.query(
      `
      UPDATE projects
      SET tenant_id = :tenantId
      WHERE tenant_id IS NULL;
    `,
      { replacements: { tenantId: fallbackTenantId } }
    );

    await queryInterface.sequelize.query(
      `
      UPDATE workspace_folders wf
      SET tenant_id = COALESCE(c.tenant_id, :tenantId)
      FROM clients c
      WHERE wf.client_id = c.id
        AND wf.tenant_id IS NULL;
    `,
      { replacements: { tenantId: fallbackTenantId } }
    );

    await queryInterface.sequelize.query(
      `
      UPDATE workspace_folders
      SET tenant_id = :tenantId
      WHERE tenant_id IS NULL;
    `,
      { replacements: { tenantId: fallbackTenantId } }
    );

    await queryInterface.sequelize.query(
      `
      UPDATE tags
      SET tenant_id = :tenantId
      WHERE tenant_id IS NULL;
    `,
      { replacements: { tenantId: fallbackTenantId } }
    );

    await queryInterface.sequelize.query(
      `
      UPDATE agenda_events ae
      SET tenant_id = COALESCE(p.tenant_id, :tenantId)
      FROM projects p
      WHERE ae.project_id = p.id
        AND ae.tenant_id IS NULL;
    `,
      { replacements: { tenantId: fallbackTenantId } }
    );

    await queryInterface.sequelize.query(
      `
      UPDATE notifications n
      SET tenant_id = COALESCE(u.tenant_id, :tenantId)
      FROM users u
      WHERE n.user_id = u.id
        AND n.tenant_id IS NULL;
    `,
      { replacements: { tenantId: fallbackTenantId } }
    );
  },

  async down() {
    // Dados já vinculados não são revertidos automaticamente.
  },
};
