'use strict';
const { authenticate } = require('../../../middleware/auth');
const { financiero } = require('../../../repositories');

async function handler(req, res, next) {
  try {
    const { id_expediente, id_honorario, active = 'true', limit = '50', offset = '0' } = req.query;
    const rows = await financiero.findPagos({
      id_expediente: id_expediente ? Number(id_expediente) : undefined,
      id_honorario: id_honorario ? Number(id_honorario) : undefined,
      active: active !== 'false', limit: Number(limit), offset: Number(offset),
    });
    res.json(rows);
  } catch (err) { next(err); }
}
module.exports = { method: 'GET', path: '/', middleware: [authenticate], handler };
