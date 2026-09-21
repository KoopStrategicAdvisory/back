'use strict';
const { authenticate } = require('../../middleware/auth');
const { audiencias } = require('../../repositories');

async function handler(req, res, next) {
  try {
    const rows = await audiencias.findProximas(Number(req.query.dias ?? 30));
    res.json(rows);
  } catch (err) { next(err); }
}

module.exports = { method: 'GET', path: '/proximas', middleware: [authenticate], handler };
