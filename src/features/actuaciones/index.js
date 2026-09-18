'use strict';
const express = require('express');
const router  = express.Router();
const slices  = [
  require('./list-actuaciones'),
  require('./get-actuacion'),
  require('./create-actuacion'),
  require('./update-actuacion'),
  require('./delete-actuacion'),
];
for (const { method, path, middleware, handler } of slices)
  router[method.toLowerCase()](path, ...middleware, handler);
module.exports = router;
