'use strict';
const { authenticate } = require('../../middleware/auth');
const AppError = require('../../errors/AppError');
const { tareas } = require('../../repositories');

async function handler(req, res, next) {
  try {
    const row = await tareas.updateChecklistItem(Number(req.params.itemId), req.body, req.user.sub);
    if (!row) throw new AppError(404, 'Item de checklist no encontrado.');
    res.json(row);
  } catch (err) { next(err); }
}

module.exports = {
  method: 'PUT', path: '/:id/checklist/:itemId',
  middleware: [authenticate],
  handler,
};
