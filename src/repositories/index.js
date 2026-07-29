'use strict';

const catalogos    = require('./catalogos');
const users        = require('./users');
const clientes     = require('./clientes');
const expedientes  = require('./expedientes');
const iterProcesal = require('./iter_procesal');
const tareas       = require('./tareas');
const actuaciones  = require('./actuaciones');
const notificaciones = require('./notificaciones');
const audiencias   = require('./audiencias');
const documentos   = require('./documentos');
const financiero   = require('./financiero');
const kanban       = require('./kanban');
const colaboracion = require('./colaboracion');

module.exports = {
  catalogos,
  users,
  clientes,
  expedientes,
  iterProcesal,
  tareas,
  actuaciones,
  notificaciones,
  audiencias,
  documentos,
  financiero,
  kanban,
  colaboracion,
};
