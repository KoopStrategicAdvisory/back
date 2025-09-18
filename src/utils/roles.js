const ALLOWED_ROLES = ['admin', 'user'];

function normalizeRoles(input, { defaultRole = 'user' } = {}) {
  const normalizedDefault = String(defaultRole || 'user').trim().toLowerCase();
  const safeDefault = ALLOWED_ROLES.includes(normalizedDefault) ? normalizedDefault : 'user';
  const roles = Array.isArray(input) ? input : [input];
  const normalized = roles
    .map((role) => String(role || '').trim().toLowerCase())
    .filter((role) => ALLOWED_ROLES.includes(role));
  if (normalized.includes('admin')) {
    return ['admin'];
  }
  if (normalized.includes('user')) {
    return ['user'];
  }
  return [safeDefault];
}

function hasAdminRole(input) {
  return normalizeRoles(input).includes('admin');
}

module.exports = {
  ALLOWED_ROLES,
  normalizeRoles,
  hasAdminRole,
};
