'use strict';
const express = require('express');
const router  = express.Router();

function mountSlices(subRouter, slices) {
  for (const { method, path, middleware, handler } of slices)
    subRouter[method.toLowerCase()](path, ...middleware, handler);
}

// Tableros
const tablerosRouter = express.Router();
mountSlices(tablerosRouter, [
  require('./tableros/list'),
  require('./tableros/get'),
  require('./tableros/create'),
  require('./tableros/update'),
  require('./tableros/delete'),
  require('./tableros/add-usuario'),
  require('./tableros/remove-usuario'),
]);
router.use('/tableros', tablerosRouter);

// Columnas — rutas mixtas: algunas bajo /tableros/:id/columnas, otras bajo /columnas/:id
const columnasTablerosRouter = express.Router({ mergeParams: true });
mountSlices(columnasTablerosRouter, [
  require('./columnas/list'),
  require('./columnas/create'),
]);
router.use('/tableros', columnasTablerosRouter);

const columnasRouter = express.Router();
mountSlices(columnasRouter, [
  require('./columnas/update'),
  require('./columnas/delete'),
  require('./columnas/add-estado'),
  require('./columnas/remove-estado'),
]);
router.use('/columnas', columnasRouter);

// Posiciones — GET bajo /columnas/:id/posiciones, POST y DELETE bajo /posiciones
const posicionesColumnasRouter = express.Router({ mergeParams: true });
mountSlices(posicionesColumnasRouter, [require('./posiciones/list')]);
router.use('/columnas', posicionesColumnasRouter);

const posicionesRouter = express.Router();
mountSlices(posicionesRouter, [
  require('./posiciones/upsert'),
  require('./posiciones/remove'),
]);
router.use('/posiciones', posicionesRouter);

// Estados (alias para remove-estado de columna_kanban_estado)
const estadosRouter = express.Router();
mountSlices(estadosRouter, [require('./columnas/remove-estado')]);
router.use('/estados', estadosRouter);

module.exports = router;
