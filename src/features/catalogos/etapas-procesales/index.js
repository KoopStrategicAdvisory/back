'use strict';
const express = require('express');
const router  = express.Router();

const slices = [
  require('./list'),
  require('./get'),
  require('./create'),
  require('./update'),
  require('./delete'),
];

for (const { method, path, middleware, handler } of slices)
  router[method.toLowerCase()](path, ...middleware, handler);

module.exports = router;
