'use strict';
const { authenticate, requireRoles } = require('../../middleware/auth');
const { verificarTodos } = require('../../services/verificarRamaJudicial');

// Dispara la verificacion automatica contra la Rama Judicial ahora mismo
// (sin esperar al cron diario) — util para probarla o para forzar una
// revision antes de generar la constancia del dia. La misma funcion la
// llama el job programado en index.js.
async function handler(req, res, next) {
  try {
    const resultado = await verificarTodos();
    res.json(resultado);
  } catch (err) { next(err); }
}

module.exports = {
  method: 'POST', path: '/verificar-rama-judicial',
  middleware: [authenticate, requireRoles('admin', 'lawyer')],
  handler,
};
