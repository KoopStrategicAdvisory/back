'use strict';
const express = require('express');
const router  = express.Router();
const slices  = [
  require('./list-documentos'),
  require('./get-documento'),
  require('./upload-documento'),
  require('./update-documento'),
  require('./delete-documento'),
];
for (const { method, path, middleware, handler } of slices)
  router[method.toLowerCase()](path, ...middleware, handler);
module.exports = router;
