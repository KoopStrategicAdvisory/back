'use strict';
const express = require('express');
const router  = express.Router();
const { catalogos } = require('../../../repositories');
const { makeCatalogSlices } = require('../_make-catalog-slices');

// A diferencia de otros catalogos (tipo de proceso, etc.), la contraparte varia
// caso a caso — un abogado necesita poder agregar una nueva sobre la marcha al
// crear un expediente, no solo un admin.
for (const slice of makeCatalogSlices(catalogos.contraparte, { writeRoles: ['admin', 'lawyer'] }))
  router[slice.method.toLowerCase()](slice.path, ...slice.middleware, slice.handler);

module.exports = router;
