'use strict';
const express = require('express');
const router  = express.Router();

router.use('/roles',             require('./roles'));
router.use('/tipo-proceso',      require('./tipo-proceso'));
router.use('/subtipo-proceso',   require('./subtipo-proceso'));
router.use('/tipo-pretension',   require('./tipo-pretension'));
router.use('/instancias',        require('./instancias'));
router.use('/tipo-actuacion',    require('./tipo-actuacion'));
router.use('/tipo-documento',    require('./tipo-documento'));
router.use('/tipo-notificacion', require('./tipo-notificacion'));
router.use('/medio-notificacion',require('./medio-notificacion'));
router.use('/estado-proceso',    require('./estado-proceso'));
router.use('/estado-etapa',      require('./estado-etapa'));
router.use('/estado-tarea',      require('./estado-tarea'));
router.use('/prioridad',         require('./prioridad'));
router.use('/calidad-usuario',   require('./calidad-usuario'));
router.use('/contraparte',       require('./contraparte'));
router.use('/tipo-proc-combo',   require('./tipo-proc-combo'));
router.use('/etapas-procesales', require('./etapas-procesales'));

module.exports = router;
