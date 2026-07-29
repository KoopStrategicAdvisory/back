'use strict';
const { authenticate } = require('../../middleware/auth');
const { tareas } = require('../../repositories');

async function handler(req, res, next) {
  try {
    const rows = await tareas.findChecklist(Number(req.params.id), { active: req.query.active !== 'false' });
    res.json(rows);
  } catch (err) { next(err); }
}

module.exports = { method: 'GET', path: '/:id/checklist', middleware: [authenticate], handler };
