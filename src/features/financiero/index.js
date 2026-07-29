'use strict';
const express = require('express');
const router  = express.Router();

// Resumen (ruta específica antes de sub-routers)
const resumen = require('./resumen');
router[resumen.method.toLowerCase()](resumen.path, ...resumen.middleware, resumen.handler);

// Sub-resources
function mountSlices(subRouter, slices) {
  for (const { method, path, middleware, handler } of slices)
    subRouter[method.toLowerCase()](path, ...middleware, handler);
}

const honorariosRouter = express.Router();
mountSlices(honorariosRouter, [
  require('./honorarios/list'),
  require('./honorarios/get'),
  require('./honorarios/create'),
  require('./honorarios/update'),
  require('./honorarios/delete'),
]);
router.use('/honorarios', honorariosRouter);

const pagosRouter = express.Router();
mountSlices(pagosRouter, [
  require('./pagos/list'),
  require('./pagos/get'),
  require('./pagos/create'),
  require('./pagos/update'),
]);
router.use('/pagos', pagosRouter);

const gastosRouter = express.Router();
mountSlices(gastosRouter, [
  require('./gastos/list'),
  require('./gastos/get'),
  require('./gastos/create'),
  require('./gastos/update'),
  require('./gastos/delete'),
]);
router.use('/gastos', gastosRouter);

module.exports = router;
