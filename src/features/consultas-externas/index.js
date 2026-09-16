'use strict';
const express = require('express');
const router  = express.Router();
const slices  = [
  require('./list-radicados'),
  require('./download-pdf'),
  require('./list-consultas'),
  require('./create-consulta'),
  require('./verificar-rama-judicial'),
];
for (const { method, path, middleware, handler } of slices)
  router[method.toLowerCase()](path, ...middleware, handler);
module.exports = router;
