'use strict';
const express = require('express');
const router  = express.Router();

const slices = [
  require('./list-users'),
  require('./get-user'),
  require('./create-user'),
  require('./update-user'),
  require('./delete-user'),
  require('./add-role'),
  require('./remove-role'),
];

for (const { method, path, middleware, handler } of slices)
  router[method.toLowerCase()](path, ...middleware, handler);

module.exports = router;
