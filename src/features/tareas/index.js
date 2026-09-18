'use strict';
const express = require('express');
const router  = express.Router();

const slices = [
  require('./mis-tareas'),
  require('./proximas-vencer'),
  require('./list-tareas'),
  require('./get-tarea'),
  require('./create-tarea'),
  require('./update-tarea'),
  require('./delete-tarea'),
  require('./list-checklist'),
  require('./create-checklist'),
  require('./update-checklist'),
  require('./delete-checklist'),
];

for (const { method, path, middleware, handler } of slices)
  router[method.toLowerCase()](path, ...middleware, handler);

module.exports = router;
