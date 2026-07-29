'use strict';
const express = require('express');
const router  = express.Router();
const slices  = [
  require('./proximas'),
  require('./list-audiencias'),
  require('./get-audiencia'),
  require('./create-audiencia'),
  require('./update-audiencia'),
  require('./delete-audiencia'),
];
for (const { method, path, middleware, handler } of slices)
  router[method.toLowerCase()](path, ...middleware, handler);
module.exports = router;
