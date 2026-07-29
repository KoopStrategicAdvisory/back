'use strict';
const { authenticate } = require('../../../middleware/auth');
const { kanban } = require('../../../repositories');

async function handler(req, res, next) {
  try {
    const row = await kanban.addEstadoColumna(Number(req.params.id), req.body, req.user.sub);
    res.status(201).json(row ?? { message: 'Estado ya mapeado.' });
  } catch (err) { next(err); }
}
module.exports = { method: 'POST', path: '/:id/estados', middleware: [authenticate], handler };
