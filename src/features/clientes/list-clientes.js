'use strict';
const { authenticate } = require('../../middleware/auth');
const { clientes } = require('../../repositories');

async function handler(req, res, next) {
  try {
    const { search, active = 'true', limit = '50', offset = '0' } = req.query;
    const [rows, total] = await Promise.all([
      clientes.findAll({ search, active: active !== 'false', limit: Number(limit), offset: Number(offset) }),
      clientes.count({ search, active: active !== 'false' }),
    ]);
    res.json({ data: rows, total });
  } catch (err) { next(err); }
}

module.exports = { method: 'GET', path: '/', middleware: [authenticate], handler };
