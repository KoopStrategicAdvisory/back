const DEFAULT_ROLES = ['admin', 'user', 'client'];
let ALLOWED_ROLES = [...DEFAULT_ROLES];

function getAllowedRoles() {
  return [...ALLOWED_ROLES];
}

function setAllowedRoles(roles = []) {
  const normalized = Array.isArray(roles)
    ? roles
        .map((role) => {
          if (typeof role === 'string') return role;
          if (role && typeof role === 'object') return role.name || role.code;
          return '';
        })
        .map((role) => String(role || '').trim().toLowerCase())
        .filter(Boolean)
    : [];

  if (!normalized.length) {
    ALLOWED_ROLES = [...DEFAULT_ROLES];
  } else {
    ALLOWED_ROLES = Array.from(new Set(normalized));
  }
}

function normalizeRoles(input, { defaultRole = 'user' } = {}) {
  const available = ALLOWED_ROLES.length ? ALLOWED_ROLES : DEFAULT_ROLES;
  const normalizedDefault = String(defaultRole || available[0] || 'user').trim().toLowerCase();
  const safeDefault = available.includes(normalizedDefault) ? normalizedDefault : available[0] || 'user';
  const roles = Array.isArray(input) ? input : [input];
  const normalized = roles
    .map((role) => String(role || '').trim().toLowerCase())
    .filter((role) => available.includes(role));

  if (!normalized.length) return [safeDefault];

  for (const allowed of available) {
    if (normalized.includes(allowed)) {
      return [allowed];
    }
  }

  return [safeDefault];
}

function hasAdminRole(input) {
  return normalizeRoles(input).includes('admin');
}

function hasClientRole(input) {
  return normalizeRoles(input).includes('client');
}

function hasUserRole(input) {
  return normalizeRoles(input).includes('user');
}

async function refreshAllowedRolesFromDb({ fallbackToDefaults = true } = {}) {
  try {
    const Role = require('../models/Role');
    const docs = await Role.find({ active: true }).sort({ priority: 1, name: 1 }).lean();
    if (docs.length) {
      setAllowedRoles(docs.map((doc) => doc.name));
    } else if (fallbackToDefaults) {
      setAllowedRoles(DEFAULT_ROLES);
    }
  } catch (err) {
    console.error('[roles] No se pudieron cargar los roles desde DB:', err?.message || err);
    if (fallbackToDefaults) {
      setAllowedRoles(DEFAULT_ROLES);
    }
  }
  return getAllowedRoles();
}

async function ensureDefaultRoles(defaults = DEFAULT_ROLES) {
  const Role = require('../models/Role');
  const shaped = (Array.isArray(defaults) ? defaults : DEFAULT_ROLES).map((role, index) => {
    if (typeof role === 'string') {
      return { name: role, system: true, priority: index };
    }
    return {
      name: String(role?.name || '').trim().toLowerCase(),
      active: role?.active !== false,
      priority: typeof role?.priority === 'number' ? role.priority : index,
      system: role?.system !== false,
      displayName: role?.displayName || role?.name,
      description: role?.description,
    };
  });
  await Role.ensureDefaults(shaped);
}

module.exports = {
  DEFAULT_ROLES,
  getAllowedRoles,
  setAllowedRoles,
  refreshAllowedRolesFromDb,
  ensureDefaultRoles,
  normalizeRoles,
  hasAdminRole,
  hasClientRole,
  hasUserRole,
};
