'use strict';
const { authenticate, requireRoles } = require('../../middleware/auth');
const { radicadosPublicos } = require('../../repositories');

async function handler(req, res, next) {
  try {
    const row = await radicadosPublicos.softDelete(Number(req.params.radId), req.user.sub);
    if (!row) return res.status(404).json({ message: 'Radicado no encontrado.' });
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = {
  method: 'DELETE', path: '/:id/radicados-publicos/:radId',
  middleware: [authenticate, requireRoles('admin', 'lawyer')],
  handler,
};
