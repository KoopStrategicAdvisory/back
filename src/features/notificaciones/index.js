'use strict';
const express = require('express');
const router  = express.Router();
const slices  = [
  require('./proximas-vencer'),
  require('./list-notificaciones'),
  require('./get-notificacion'),
  require('./create-notificacion'),
  require('./update-notificacion'),
  require('./delete-notificacion'),
];
for (const { method, path, middleware, handler } of slices)
  router[method.toLowerCase()](path, ...middleware, handler);
module.exports = router;
