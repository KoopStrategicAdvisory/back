const jwt = require('jsonwebtoken');

function authenticate(req, res, next) {
  try {
    const header = req.headers['authorization'] || '';
    const parts = header.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({ message: 'No autenticado.' });
    }
    const token = parts[1];
    const payload = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    req.user = payload; // { sub, email, roles, iat, exp }
    next();
  } catch (err) {
    if (err && err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expirado.' });
    }
    return res.status(401).json({ message: 'Token inválido.' });
  }
}

// El codigo de la app se escribio pidiendo roles genericos en ingles
// ('admin', 'lawyer'), pero el catalogo real de roles (cargado desde el
// Excel en seed.sql) quedo en español: admin, super_admin, socio, abogado,
// asociado, junior, paralegal, secretario, contador, cliente, emprendedor.
// Sin este alias ningun usuario real podia pasar un requireRoles('lawyer'),
// porque ese rol no existe en el catalogo. Ajusta este mapa si cambian los
// nombres de roles en la base de datos.
const ROLE_ALIASES = {
  admin:  ['admin', 'super_admin'],
  lawyer: ['abogado', 'socio', 'asociado', 'junior', 'paralegal'],
};

function expandRole(role) {
  const key = String(role).toLowerCase();
  return ROLE_ALIASES[key] || [key];
}

function requireRoles(...required) {
  const requiredLower = required.flatMap(expandRole);
  return function (req, res, next) {
    const roles = Array.isArray(req.user?.roles) ? req.user.roles : [];
    const rolesLower = roles.map((r) => String(r).toLowerCase());
    // super_admin siempre pasa cualquier chequeo de rol: es el administrador del sistema.
    const ok = rolesLower.includes('super_admin') || requiredLower.some((r) => rolesLower.includes(r));
    if (!ok) return res.status(403).json({ message: 'No autorizado.' });
    next();
  };
}

const requireAdmin = requireRoles('admin');

module.exports = { authenticate, requireRoles, requireAdmin };

