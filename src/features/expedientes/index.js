'use strict';
const express = require('express');
const router  = express.Router();

const slices = [
  require('./list-expedientes'),
  require('./get-expediente'),
  require('./create-expediente'),
  require('./update-expediente'),
  require('./delete-expediente'),
  require('./list-etapas'),
  require('./create-etapa'),
  require('./update-etapa'),
  require('./delete-etapa'),
];

for (const { method, path, middleware, handler } of slices)
  router[method.toLowerCase()](path, ...middleware, handler);

module.exports = router;
