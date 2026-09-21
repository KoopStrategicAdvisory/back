'use strict';
const { body } = require('express-validator');
const { authenticate, requireRoles } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { agregar } = require('../../repositories/seguimientoDiario');

module.exports = {
  method: 'POST', path: '/seguimientos',
  middleware: [authenticate, requireRoles('admin', 'lawyer'),
    body('id_expediente').isInt({ min: 1 }),
    body('organismo').isString().trim().notEmpty(),
    body('modalidad').isIn(['manual', 'automatica']), validate],
  async handler(req, res, next) {
    try { res.status(201).json(await agregar(req.body, req.user.sub)); }
    catch (err) { next(err); }
  },
};
