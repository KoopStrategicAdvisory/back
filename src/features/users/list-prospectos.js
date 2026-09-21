'use strict';
const { authenticate, requireRoles } = require('../../middleware/auth');
const { users } = require('../../repositories');

// Gente que se registro pero su cedula nunca hizo match con ningun cliente
// de la firma — no son "cuentas rotas", pueden ser un prospecto real que
// encontro la pagina y quiere una asesoria. El equipo decide si los llama
// o los descarta.
async function handler(req, res, next) {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 100;
    const offset = req.query.offset ? Number(req.query.offset) : 0;
    const rows = await users.findPendientesSinCliente({ limit, offset });
    res.json({ items: rows, total: rows.length });
  } catch (err) { next(err); }
}

module.exports = {
  method: 'GET', path: '/prospectos',
  middleware: [authenticate, requireRoles('admin', 'lawyer')],
  handler,
};
