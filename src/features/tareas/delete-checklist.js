'use strict';
const { authenticate } = require('../../middleware/auth');
const AppError = require('../../errors/AppError');
const { tareas } = require('../../repositories');

async function handler(req, res, next) {
  try {
    const row = await tareas.softDeleteChecklistItem(Number(req.params.itemId), req.user.sub);
    if (!row) throw new AppError(404, 'Item de checklist no encontrado.');
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = {
  method: 'DELETE', path: '/:id/checklist/:itemId',
  middleware: [authenticate],
  handler,
};
