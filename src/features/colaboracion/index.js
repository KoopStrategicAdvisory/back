'use strict';
const express = require('express');
const router  = express.Router();

function mountSlices(subRouter, slices) {
  for (const { method, path, middleware, handler } of slices)
    subRouter[method.toLowerCase()](path, ...middleware, handler);
}

// Etiquetas
const etiquetasRouter = express.Router();
mountSlices(etiquetasRouter, [
  require('./etiquetas/add-to-entidad'),
  require('./etiquetas/remove-from-entidad'),
  require('./etiquetas/list'),
  require('./etiquetas/get'),
  require('./etiquetas/create'),
  require('./etiquetas/update'),
  require('./etiquetas/delete'),
]);
router.use('/etiquetas', etiquetasRouter);

// Comentarios
const comentariosRouter = express.Router();
mountSlices(comentariosRouter, [
  require('./comentarios/replies'),
  require('./comentarios/add-mencion'),
  require('./comentarios/remove-mencion'),
  require('./comentarios/list'),
  require('./comentarios/get'),
  require('./comentarios/create'),
  require('./comentarios/update'),
  require('./comentarios/delete'),
]);
router.use('/comentarios', comentariosRouter);

// Adjuntos
const adjuntosRouter = express.Router();
mountSlices(adjuntosRouter, [
  require('./adjuntos/list'),
  require('./adjuntos/create'),
  require('./adjuntos/delete'),
]);
router.use('/adjuntos', adjuntosRouter);

// Dependencias
const dependenciasRouter = express.Router();
mountSlices(dependenciasRouter, [
  require('./dependencias/list'),
  require('./dependencias/create'),
  require('./dependencias/delete'),
]);
router.use('/dependencias', dependenciasRouter);

module.exports = router;
