'use strict';
const { body, param } = require('express-validator');
const { authenticate, requireRoles } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { configurar } = require('../../repositories/seguimientoDiario');

module.exports = {
  method: 'PUT', path: '/radicados/:id/seguimiento',
  middleware: [authenticate, requireRoles('admin', 'lawyer'),
    param('id').isInt({ min: 1 }),
    body('modalidad').custom((v) => v === null || ['manual', 'automatica'].includes(v))
      .withMessage('Indica manual, automatica o null para retirar.'), validate],
  async handler(req, res, next) {
    try { res.json(await configurar(req.params.id, req.body.modalidad, req.user.sub)); }
    catch (err) { next(err); }
  },
};
