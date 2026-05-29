const catchAsync = require("../../middlewares/catch-async");
const { sendSuccess } = require("../../utils/response");
const adminService = require("./admin.service");

const listTenants = catchAsync(async (req, res) => {
  const tenants = await adminService.listTenants(req.query);
  return sendSuccess(res, tenants);
});

const getTenantStats = catchAsync(async (req, res) => {
  const data = await adminService.getTenantStats(req.params.id);
  return sendSuccess(res, data);
});

const updateTenant = catchAsync(async (req, res) => {
  const tenant = await adminService.updateTenant(req.params.id, req.body);
  return sendSuccess(res, tenant);
});

module.exports = { listTenants, getTenantStats, updateTenant };
