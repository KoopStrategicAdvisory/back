'use strict';
const { body } = require('express-validator');
const { authenticate, requireRoles } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { expedientes } = require('../../repositories');

const rules = [
  body('numero_de_expediente').trim().notEmpty().withMessage('El número de expediente es requerido.'),
  // Radicado del juzgado/despacho correspondiente: a diferencia del numero_de_expediente
  // (interno de la firma, obligatorio), este es opcional — no siempre se conoce al crear
  // el expediente, y algunos tramites nunca llegan a tener uno.
  body('numero_radicado_despacho').optional({ checkFalsy: true }).trim().isLength({ max: 60 })
    .withMessage('El radicado del despacho no puede superar los 60 caracteres.'),
  body('id_cliente').optional().isInt({ min: 1 }),
  // La columna es NOT NULL en el esquema (expediente.id_tipo_proc_subtipo_proc_tipo_pre);
  // antes se validaba un campo 'id_combo' que el repositorio nunca lee.
  body('id_tipo_proc_subtipo_proc_tipo_pre').isInt({ min: 1 })
    .withMessage('La materia (tipo de proceso/subtipo/pretensión) es requerida.'),
  // Contraparte y correo del juzgado/entidad son obligatorios al crear — Felipe pidio
  // explicitamente que estos dos datos no queden en blanco (a diferencia de direccion
  // del juzgado, que si es opcional).
  body('id_contraparte').isInt({ min: 1 }).withMessage('La contraparte (parte demandada) es requerida.'),
  body('correo_juzgado').trim().notEmpty().withMessage('El correo del juzgado/entidad es requerido.')
    .isEmail().withMessage('El correo del juzgado/entidad no es válido.'),
  body('direccion_juzgado').optional({ checkFalsy: true }).trim().isLength({ max: 255 })
    .withMessage('La dirección del juzgado no puede superar los 255 caracteres.'),
  body('id_estado_proceso').optional().isInt({ min: 1 }),
];

async function handler(req, res, next) {
  try {
    const row = await expedientes.create(req.body, req.user.sub);
    // Todo expediente nuevo arranca con el orden real del tramite (si su
    // tipo/subtipo/pretension tiene iter procesal cargado) en vez de que el
    // abogado tenga que armar las etapas una por una a mano. Si el combo no
    // tiene plantilla (todavia no se cubrio en el catalogo importado), esto
    // simplemente no crea nada — no es un error, el expediente igual queda
    // creado y las etapas se pueden agregar manualmente despues.
    try {
      await expedientes.generateEtapasFromPlantilla(row.id, req.user.sub);
    } catch (e) {
      console.error('[EXPEDIENTES] no se pudieron generar etapas automaticas para', row.id, ':', e.message);
    }
    res.status(201).json(row);
  } catch (err) { next(err); }
}

module.exports = {
  method: 'POST', path: '/',
  middleware: [authenticate, requireRoles('admin', 'lawyer'), ...rules, validate],
  handler,
};
