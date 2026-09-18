'use strict';
const { authenticate } = require('../../../middleware/auth');
const { kanban } = require('../../../repositories');

async function handler(req, res, next) {
  try {
    const { id_expediente, active = 'true', limit = '50', offset = '0' } = req.query;
    const rows = await kanban.findTableros({
      id_usuario: req.user.sub,
      id_expediente: id_expediente ? Number(id_expediente) : undefined,
      active: active !== 'false', limit: Number(limit), offset: Number(offset),
    });
    res.json(rows);
  } catch (err) { next(err); }
}
module.exports = { method: 'GET', path: '/', middleware: [authenticate], handler };
