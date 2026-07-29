'use strict';
const express = require('express');
const router  = express.Router();

const slices = [
  require('./register'),
  require('./login'),
  require('./logout'),
  require('./me'),
  require('./refresh'),
  require('./forgot-password'),
  require('./reset-password'),
  require('./verify-email'),
];

for (const { method, path, middleware, handler } of slices)
  router[method.toLowerCase()](path, ...middleware, handler);

module.exports = router;
