'use strict';
const express = require('express');
const router  = express.Router();

const slices = [
  require('./list-clientes'),
  require('./get-cliente'),
  require('./create-cliente'),
  require('./update-cliente'),
  require('./delete-cliente'),
];

for (const { method, path, middleware, handler } of slices)
  router[method.toLowerCase()](path, ...middleware, handler);

module.exports = router;
