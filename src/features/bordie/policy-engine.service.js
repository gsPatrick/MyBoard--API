const { Tenant, User } = require("../../models");

const POLICY_MODES = {
  ALWAYS_CONFIRM: "always_confirm",
  CONFIRM_SENSITIVE: "confirm_sensitive",
  AUTO_EXECUTE: "auto_execute",
};

const SENSITIVE_ACTION_TYPES = new Set([
  "send_whatsapp_media",
  "send_whatsapp_text",
  "board_clear",
  "board_replace_all",
  "board_delete_elements",
  "workspace_delete",
  // Ações destrutivas de workspace — sempre exigem confirmação (exceto auto_execute por admin).
  "project_delete",
  "client_delete",
  "agenda_delete",
]);

const AUTO_SAFE_ACTION_TYPES = new Set([
  "board_append_elements",
  "board_add_note",
  "board_patch_scene",
]);

const DEFAULT_POLICY = {
  mode: POLICY_MODES.CONFIRM_SENSITIVE,
  overrides: {},
};

function normalizePolicy(raw = {}) {
  const mode = Object.values(POLICY_MODES).includes(raw.mode)
    ? raw.mode
    : DEFAULT_POLICY.mode;

  return {
    mode,
    overrides:
      raw.overrides && typeof raw.overrides === "object" ? raw.overrides : {},
  };
}

async function loadPolicy({ tenantId, userId }) {
  const [tenant, user] = await Promise.all([
    tenantId ? Tenant.findByPk(tenantId) : null,
    userId ? User.findByPk(userId) : null,
  ]);

  const tenantPolicy = normalizePolicy(tenant?.settings?.bordie_policy || {});
  const userPolicy = normalizePolicy(user?.metadata?.bordie_policy || {});

  return {
    ...tenantPolicy,
    ...userPolicy,
    overrides: {
      ...tenantPolicy.overrides,
      ...userPolicy.overrides,
    },
  };
}

function resolveActionSensitivity(actionType) {
  if (SENSITIVE_ACTION_TYPES.has(actionType)) return "sensitive";
  if (AUTO_SAFE_ACTION_TYPES.has(actionType)) return "safe";
  return "normal";
}

function evaluateAction(action, policy, { userRole } = {}) {
  if (!action?.type) {
    return { allowed: true, requires_confirmation: false, reason: "no_action" };
  }

  const actionType = action.type;
  const override = policy.overrides?.[actionType];

  if (override === "deny") {
    return { allowed: false, requires_confirmation: false, reason: "denied_by_policy" };
  }

  if (override === "auto") {
    return { allowed: true, requires_confirmation: false, reason: "override_auto" };
  }

  if (override === "confirm") {
    return { allowed: true, requires_confirmation: true, reason: "override_confirm" };
  }

  if (policy.mode === POLICY_MODES.ALWAYS_CONFIRM) {
    return { allowed: true, requires_confirmation: true, reason: "always_confirm" };
  }

  if (policy.mode === POLICY_MODES.AUTO_EXECUTE) {
    const sensitivity = resolveActionSensitivity(actionType);
    if (sensitivity === "sensitive" && userRole !== "admin" && userRole !== "developer") {
      return { allowed: true, requires_confirmation: true, reason: "sensitive_in_auto_mode" };
    }
    return { allowed: true, requires_confirmation: false, reason: "auto_execute" };
  }

  const sensitivity = resolveActionSensitivity(actionType);
  if (sensitivity === "sensitive") {
    return { allowed: true, requires_confirmation: true, reason: "sensitive_action" };
  }

  if (action.requires_confirmation === true) {
    return { allowed: true, requires_confirmation: true, reason: "action_flag" };
  }

  return { allowed: true, requires_confirmation: false, reason: "allowed" };
}

function applyPolicyToAction(action, evaluation) {
  if (!action) return null;
  if (!evaluation.allowed) return null;

  return {
    ...action,
    requires_confirmation: evaluation.requires_confirmation,
    policy: {
      reason: evaluation.reason,
    },
  };
}

module.exports = {
  POLICY_MODES,
  SENSITIVE_ACTION_TYPES,
  loadPolicy,
  evaluateAction,
  applyPolicyToAction,
  normalizePolicy,
};
