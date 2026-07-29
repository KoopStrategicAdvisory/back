'use strict';
const express = require('express');
const router  = express.Router();

const slices = [
  require('./list-iter'),
  require('./get-iter'),
  require('./create-iter'),
  require('./update-iter'),
  require('./delete-iter'),
  require('./list-tareas-plantilla'),
  require('./create-tarea-plantilla'),
  require('./update-tarea-plantilla'),
  require('./delete-tarea-plantilla'),
];

for (const { method, path, middleware, handler } of slices)
  router[method.toLowerCase()](path, ...middleware, handler);

module.exports = router;
