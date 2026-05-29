const authenticate = require("./authenticate");
const resolveTenant = require("./resolve-tenant");

const requireAuth = [authenticate, resolveTenant];

module.exports = { requireAuth, authenticate, resolveTenant };
