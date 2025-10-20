const ALLOWED_ROLES = ['admin', 'user', 'client'];

function normalizeRoles(input, { defaultRole = 'user' } = {}) {
  const normalizedDefault = String(defaultRole || 'user').trim().toLowerCase();
  const safeDefault = ALLOWED_ROLES.includes(normalizedDefault) ? normalizedDefault : 'user';
  const roles = Array.isArray(input) ? input : [input];
  const normalized = roles
    .map((role) => String(role || '').trim().toLowerCase())
    .filter((role) => ALLOWED_ROLES.includes(role));
  
  // Prioridad: admin > client > user
  if (normalized.includes('admin')) {
    return ['admin'];
  }
  if (normalized.includes('client')) {
    return ['client'];
  }
  if (normalized.includes('user')) {
    return ['user'];
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

module.exports = {
  ALLOWED_ROLES,
  normalizeRoles,
  hasAdminRole,
  hasClientRole,
  hasUserRole,
};
