'use strict';
const express = require('express');
const router  = express.Router();
const { catalogos } = require('../../../repositories');
const { makeCatalogSlices } = require('../_make-catalog-slices');

for (const slice of makeCatalogSlices(catalogos.estadoProceso))
  router[slice.method.toLowerCase()](slice.path, ...slice.middleware, slice.handler);

module.exports = router;
