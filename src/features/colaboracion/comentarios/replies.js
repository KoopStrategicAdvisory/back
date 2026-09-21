'use strict';
const { authenticate } = require('../../../middleware/auth');
const { colaboracion } = require('../../../repositories');

async function handler(req, res, next) {
  try {
    const rows = await colaboracion.findReplies(Number(req.params.id), { active: req.query.active !== 'false' });
    res.json(rows);
  } catch (err) { next(err); }
}
module.exports = { method: 'GET', path: '/:id/replies', middleware: [authenticate], handler };
