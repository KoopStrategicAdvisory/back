// models/koop.models.js
const mongoose = require('mongoose');
const { Schema, model } = mongoose;
const { ObjectId } = Schema.Types;

const opts = { timestamps: { createdAt: 'CREATED_AT', updatedAt: 'UPDATED_AT' } };

const safe = (name, schema) => {
  if (mongoose.models[name]) return mongoose.models[name];
  try { return model(name, schema); } catch { return mongoose.model(name); }
};

/* ============ CATÁLOGOS ============ */
const RoleSchema = new Schema({ NOMBRE: { type: String, required: true }, Active: { type: Boolean, default: true }, DESCRIPCION: String });
const TipoProcesoSchema = new Schema({ NOMBRE: { type: String, required: true }, ACTIVE: { type: Boolean, default: true } });
const SubtipoProcesoSchema = new Schema({ NOMBRE: { type: String, required: true }, ACTIVE: { type: Boolean, default: true } });
const TipoPretensionSchema = new Schema({ NOMBRE: { type: String, required: true } });
const TipoProcSubtipoProcTipoPreSchema = new Schema({
  ID_TIPO_PROCESO: { type: ObjectId, ref: 'TipoProceso' }, ID_SUBTIPO_PROCESO: { type: ObjectId, ref: 'SubtipoProceso' }, ID_TIPO_PRETENSION: { type: ObjectId, ref: 'TipoPretension' },
  NOMBRE_TIPO_PROCESO: String, NOMBRE_SUBTIPO_PROCESO: String, NOMBRE_TIPO_PRETENSION: String, ACTIVE: { type: Boolean, default: true },
});
const InstanciaSchema = new Schema({ NOMBRE: { type: String, required: true } });
const TipoActuacionSchema = new Schema({ NOMBRE: { type: String, required: true }, DESCRIPCION: String, ACTIVE: { type: Boolean, default: true } });
const TipoDocumentoSchema = new Schema({ NOMBRE: { type: String, required: true }, ACTIVE: { type: Boolean, default: true } });
const TipoNotificacionSchema = new Schema({ NOMBRE: { type: String, required: true }, FUNDAMENTO_LEGAL: String, DIAS_SURTIMIENTO: Number, DESCRIPCION: String, ACTIVE: { type: Boolean, default: true } });
const MedioNotificacionSchema = new Schema({ NOMBRE: { type: String, required: true }, ACTIVE: { type: Boolean, default: true } });
const EstadoProcesoSchema = new Schema({ NOMBRE: { type: String, required: true }, DESCRIPCION: String, ACTIVE: { type: Boolean, default: true } });
const EstadoEtapaSchema = new Schema({ NOMBRE: { type: String, required: true }, ACTIVE: { type: Boolean, default: true } });
const EstadoTareaSchema = new Schema({ NOMBRE: { type: String, required: true }, ACTIVE: { type: Boolean, default: true } });
const PrioridadSchema = new Schema({ NOMBRE: { type: String, required: true }, NIVEL: Number, ACTIVE: { type: Boolean, default: true } });

/* ============ USUARIOS ============ */
const UserSchema = new Schema({
  NOMBRE: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  PASSWORD_HASH: { type: String, required: true },
  roles: [{ type: ObjectId, ref: 'Role' }],
  EMAIL_VERIFICATION_TOKEN: String, EMAIL_VERIFICATION_EXPIRES: Date,
  V: { type: Number, default: 0 }, active: { type: Boolean, default: true },
  tipo_documento: { type: ObjectId, ref: 'TipoDocumento' }, numero_documento: { type: String, index: true },
  telefono_principal: String, telefono_alterno: String, direccion_notificacion: String,
  ciudad: String, departamento: String, pais: String,
  tarjeta_profesional: String, numero_tarjeta_prof: String, fecha_expedicion_tp: Date,
  especialidades: [{ type: String }], cargo: String,
  id_supervisor: { type: ObjectId, ref: 'User' }, fecha_ingreso: Date, fecha_retiro: Date,
  tarifa_hora: Number, moneda_tarifa: String, firma_digital_url: String, foto_url: String,
  zona_horaria: String, idioma_preferido: String, last_login: Date,
  failed_login_attempts: { type: Number, default: 0 }, locked_until: Date,
  mfa_enabled: { type: Boolean, default: false }, mfa_secret: String,
  password_reset_token: String, password_reset_expires: Date, must_change_password: { type: Boolean, default: false },
}, opts);

/* ============ EXPEDIENTE Y FLUJO ============ */
const ExpedienteSchema = new Schema({
  id_usuario: { type: ObjectId, ref: 'User', required: true }, active: { type: Boolean, default: true },
  numero_de_expediente: { type: String, required: true, unique: true }, cliente: String, calidad: String,
  ID_TIPO_PROC_SUBTIPO_PROC_TIPO_PRE: { type: ObjectId, ref: 'TipoProcSubtipoProcTipoPre' },
  NOMBRE_TIPO_PROCESO: String, NOMBRE_SUBTIPO_PROCESO: String, NOMBRE_TIPO_PRETENSION: String,
  contraparte: String, juzgado_o_autoridad_que_conoce: String,
}, opts);

const EtapaProcesalSchema = new Schema({
  ID_TIPO_PROCESO: { type: ObjectId, ref: 'TipoProceso' }, NOMBRE_TIPO_PROCESO: String,
  NOMBRE_ETAPA: { type: String, required: true }, DESCRIPCION: String, FUNDAMENTO_LEGAL: String, ACTIVE: { type: Boolean, default: true },
});

const IterProcesalPlantillaSchema = new Schema({
  ID_TIPO_PROC_SUBTIPO_PROC_TIPO_PRE: { type: ObjectId, ref: 'TipoProcSubtipoProcTipoPre' },
  ID_ETAPA: { type: ObjectId, ref: 'EtapaProcesal' }, NOMBRE_ETAPA: String, ORDEN: Number,
  ID_INSTANCIA: { type: ObjectId, ref: 'Instancia' }, PLAZO_DIAS: Number, DIAS_HABILES: { type: Boolean, default: true },
  DISPARA_NOTIFICACION: { type: Boolean, default: false }, ID_TIPO_NOTIFICACION_ESPERADA: { type: ObjectId, ref: 'TipoNotificacion' },
  ETAPA_ANTERIOR_ID: { type: ObjectId, ref: 'EtapaProcesal' }, ES_OBLIGATORIA: { type: Boolean, default: true },
  OBSERVACIONES: String, ACTIVE: { type: Boolean, default: true },
});

const TareaPlantillaSchema = new Schema({
  ID_ITER_PLANTILLA: { type: ObjectId, ref: 'IterProcesalPlantilla' }, TITULO: { type: String, required: true },
  DESCRIPCION: String, DIAS_DESDE_ETAPA: Number, DIAS_HABILES: { type: Boolean, default: true },
  ID_PRIORIDAD: { type: ObjectId, ref: 'Prioridad' }, ID_ROL_RESPONSABLE: { type: ObjectId, ref: 'Role' },
  ES_HITO_CRITICO: { type: Boolean, default: false }, ACTIVE: { type: Boolean, default: true },
});

const ExpedienteEtapaSchema = new Schema({
  ID_EXPEDIENTE: { type: ObjectId, ref: 'Expediente', index: true }, ID_ITER_PLANTILLA: { type: ObjectId, ref: 'IterProcesalPlantilla' },
  ID_ETAPA: { type: ObjectId, ref: 'EtapaProcesal' }, NOMBRE_ETAPA: String, ORDEN: Number,
  ID_INSTANCIA: { type: ObjectId, ref: 'Instancia' }, ID_ESTADO_ETAPA: { type: ObjectId, ref: 'EstadoEtapa' },
  FECHA_INICIO: Date, FECHA_VENCIMIENTO: Date, FECHA_FIN_REAL: Date,
  ID_USUARIO_RESPONSABLE: { type: ObjectId, ref: 'User' }, OBSERVACIONES: String, ORIGEN: String, ACTIVE: { type: Boolean, default: true },
}, opts);

/* ============ TAREAS ============ */
const TareaSchema = new Schema({
  ID_EXPEDIENTE: { type: ObjectId, ref: 'Expediente', index: true }, ID_EXPEDIENTE_ETAPA: { type: ObjectId, ref: 'ExpedienteEtapa' },
  ID_TAREA_PLANTILLA: { type: ObjectId, ref: 'TareaPlantilla' }, TITULO: { type: String, required: true }, DESCRIPCION: String,
  ID_USUARIO_ASIGNADO: { type: ObjectId, ref: 'User', index: true }, ID_USUARIO_CREADOR: { type: ObjectId, ref: 'User' },
  ID_PRIORIDAD: { type: ObjectId, ref: 'Prioridad' }, ID_ESTADO_TAREA: { type: ObjectId, ref: 'EstadoTarea', index: true },
  ORIGEN: String, FECHA_CREACION: { type: Date, default: Date.now }, FECHA_LIMITE: { type: Date, index: true },
  FECHA_COMPLETADO: Date, ES_HITO_PRECLUSIVO: { type: Boolean, default: false }, OBSERVACIONES: String, ACTIVE: { type: Boolean, default: true },
}, opts);

/* ============ ACTUACIONES / NOTIFICACIONES / AUDIENCIAS ============ */
const ActuacionSchema = new Schema({
  ID_EXPEDIENTE: { type: ObjectId, ref: 'Expediente', index: true }, ID_EXPEDIENTE_ETAPA: { type: ObjectId, ref: 'ExpedienteEtapa' },
  FECHA: Date, ID_TIPO_ACTUACION: { type: ObjectId, ref: 'TipoActuacion' }, TITULO: String, DESCRIPCION: String,
  AUTORIDAD_EMITE: String, ID_USUARIO_REGISTRA: { type: ObjectId, ref: 'User' },
  ID_DOCUMENTO: { type: ObjectId, ref: 'Documento' }, ES_HITO: { type: Boolean, default: false },
  URL_RAMA_JUDICIAL: String, ACTIVE: { type: Boolean, default: true },
}, opts);

const NotificacionSchema = new Schema({
  ID_EXPEDIENTE: { type: ObjectId, ref: 'Expediente', index: true }, ID_EXPEDIENTE_ETAPA: { type: ObjectId, ref: 'ExpedienteEtapa' },
  ID_ACTUACION: { type: ObjectId, ref: 'Actuacion' }, ID_TIPO_NOTIFICACION: { type: ObjectId, ref: 'TipoNotificacion' },
  ID_MEDIO_NOTIFICACION: { type: ObjectId, ref: 'MedioNotificacion' }, PARTE_NOTIFICADA: String,
  DESTINATARIO: String, DIRECCION_O_CORREO: String, FECHA_REALIZACION: Date, FECHA_SURTIMIENTO: Date,
  DIAS_PLAZO: Number, FECHA_VENCIMIENTO: Date, OBJETO_NOTIFICACION: String, ESTADO: String,
  CONSTANCIA_URL: String, OBSERVACIONES: String, ID_USUARIO_REGISTRA: { type: ObjectId, ref: 'User' }, ACTIVE: { type: Boolean, default: true },
}, opts);

const AudienciaSchema = new Schema({
  ID_EXPEDIENTE: { type: ObjectId, ref: 'Expediente', index: true }, ID_EXPEDIENTE_ETAPA: { type: ObjectId, ref: 'ExpedienteEtapa' },
  TIPO_AUDIENCIA: String, FECHA_PROGRAMADA: { type: Date, index: true }, HORA: Date, MODALIDAD: String,
  ENLACE_VIRTUAL: String, JUZGADO_O_AUTORIDAD: String, DIRECCION_FISICA: String,
  ASISTENTES: [{ type: String }], ID_USUARIO_RESPONSABLE: { type: ObjectId, ref: 'User' },
  ESTADO: String, RESULTADO: String, PROXIMA_FECHA: Date,
  ID_ACTA_DOCUMENTO: { type: ObjectId, ref: 'Documento' }, OBSERVACIONES: String, ACTIVE: { type: Boolean, default: true },
}, opts);

/* ============ DOCUMENTOS ============ */
const DocumentoSchema = new Schema({
  ID_EXPEDIENTE: { type: ObjectId, ref: 'Expediente', index: true }, ID_TIPO_DOCUMENTO: { type: ObjectId, ref: 'TipoDocumento' },
  NOMBRE_ARCHIVO: String, TITULO: String, DESCRIPCION: String, URL_STORAGE: String,
  MIME_TYPE: String, TAMANO_BYTES: Number, FECHA_DOCUMENTO: Date, FECHA_CARGA: { type: Date, default: Date.now },
  ID_USUARIO_CARGA: { type: ObjectId, ref: 'User' }, ID_EXPEDIENTE_ETAPA: { type: ObjectId, ref: 'ExpedienteEtapa' },
  VERSION: { type: Number, default: 1 }, VISIBILIDAD_CLIENTE: { type: Boolean, default: false }, ACTIVE: { type: Boolean, default: true },
}, opts);

/* ============ HONORARIOS / PAGOS / GASTOS ============ */
const HonorarioSchema = new Schema({
  ID_EXPEDIENTE: { type: ObjectId, ref: 'Expediente', index: true }, ID_USUARIO: { type: ObjectId, ref: 'User' },
  MODALIDAD: String, DESCRIPCION_MODALIDAD: String, MONTO_TOTAL_PACTADO: Number, MONEDA: { type: String, default: 'COP' },
  PORCENTAJE_CUOTA_LITIS: Number, FECHA_PACTO: Date, FECHA_INICIO: Date, FECHA_FIN: Date,
  FORMA_PAGO: String, NUMERO_CUOTAS: Number, VALOR_CUOTA: Number, DIA_PAGO_MES: Number,
  INCLUYE_GASTOS: { type: Boolean, default: false }, OBSERVACIONES: String, CONTRATO_URL: String, ESTADO: String, ACTIVE: { type: Boolean, default: true },
}, opts);

const PagoSchema = new Schema({
  ID_EXPEDIENTE: { type: ObjectId, ref: 'Expediente', index: true }, ID_HONORARIO: { type: ObjectId, ref: 'Honorario' },
  ID_USUARIO: { type: ObjectId, ref: 'User' }, FECHA_PAGO: { type: Date, index: true }, NUMERO_CUOTA: Number,
  CONCEPTO: String, MONTO: Number, MONEDA: { type: String, default: 'COP' }, METODO_PAGO: String,
  BANCO: String, NUMERO_REFERENCIA: String, NUMERO_FACTURA: String, NUMERO_RECIBO: String,
  COMPROBANTE_URL: String, PAGADO_POR: String, OBSERVACIONES: String, ESTADO: String, ACTIVE: { type: Boolean, default: true },
}, opts);

const GastoProcesoSchema = new Schema({
  ID_EXPEDIENTE: { type: ObjectId, ref: 'Expediente', index: true }, ID_USUARIO: { type: ObjectId, ref: 'User' },
  FECHA_GASTO: Date, CATEGORIA_GASTO: String, DESCRIPCION: String, MONTO: Number, MONEDA: { type: String, default: 'COP' },
  PROVEEDOR: String, NIT_PROVEEDOR: String, NUMERO_FACTURA: String, FACTURA_URL: String,
  REEMBOLSABLE: { type: Boolean, default: false }, REEMBOLSADO: { type: Boolean, default: false },
  FECHA_REEMBOLSO: Date, PAGADO_POR: String, OBSERVACIONES: String, ACTIVE: { type: Boolean, default: true },
}, opts);

/* ============ KANBAN ============ */
const TableroKanbanSchema = new Schema({
  NOMBRE: { type: String, required: true }, DESCRIPCION: String, TIPO_GRANULARIDAD: String, TIPO_AMBITO: String,
  ID_EXPEDIENTE: { type: ObjectId, ref: 'Expediente' }, ID_USUARIO_PROPIETARIO: { type: ObjectId, ref: 'User' },
  ES_PUBLICO: { type: Boolean, default: false }, USUARIOS_COMPARTIDOS: [{ type: ObjectId, ref: 'User' }],
  FILTROS_DEFAULT: { type: Schema.Types.Mixed }, VISTA_DEFAULT: String, ACTIVE: { type: Boolean, default: true },
}, opts);

const ColumnaKanbanSchema = new Schema({
  ID_TABLERO: { type: ObjectId, ref: 'TableroKanban', index: true }, NOMBRE: { type: String, required: true }, ORDEN: Number,
  COLOR: String, ESTADOS_MAPEADOS: [{ type: ObjectId, ref: 'EstadoTarea' }], WIP_LIMIT: Number,
  ES_INICIAL: { type: Boolean, default: false }, ES_FINAL: { type: Boolean, default: false },
  REGLA_AUTO_MOVER: { type: Schema.Types.Mixed }, ACTIVE: { type: Boolean, default: true },
});

const TareaKanbanPositionSchema = new Schema({
  ID_TABLERO: { type: ObjectId, ref: 'TableroKanban', index: true }, ID_COLUMNA: { type: ObjectId, ref: 'ColumnaKanban' },
  TIPO_ENTIDAD: { type: String, enum: ['TAREA', 'EXPEDIENTE_ETAPA'] },
  ID_TAREA: { type: ObjectId, ref: 'Tarea' }, ID_EXPEDIENTE_ETAPA: { type: ObjectId, ref: 'ExpedienteEtapa' },
  ORDEN_VERTICAL: Number, FECHA_MOVIMIENTO: { type: Date, default: Date.now },
  ID_USUARIO_MOVIO: { type: ObjectId, ref: 'User' }, ACTIVE: { type: Boolean, default: true },
}, opts);

/* ============ ETIQUETAS / COMENTARIOS / CHECKLIST / ADJUNTOS / DEPENDENCIAS ============ */
const EtiquetaSchema = new Schema({
  NOMBRE: { type: String, required: true }, COLOR: String, ICONO: String,
  ID_USUARIO_CREADOR: { type: ObjectId, ref: 'User' }, DESCRIPCION: String, ACTIVE: { type: Boolean, default: true },
}, opts);

const TareaEtiquetaSchema = new Schema({
  TIPO_ENTIDAD: { type: String, enum: ['TAREA', 'EXPEDIENTE_ETAPA'] },
  ID_TAREA: { type: ObjectId, ref: 'Tarea' }, ID_EXPEDIENTE_ETAPA: { type: ObjectId, ref: 'ExpedienteEtapa' },
  ID_ETIQUETA: { type: ObjectId, ref: 'Etiqueta' }, ID_USUARIO_AGREGO: { type: ObjectId, ref: 'User' }, ACTIVE: { type: Boolean, default: true },
}, opts);

const ComentarioTareaSchema = new Schema({
  TIPO_ENTIDAD: { type: String, enum: ['TAREA', 'EXPEDIENTE_ETAPA'] },
  ID_TAREA: { type: ObjectId, ref: 'Tarea' }, ID_EXPEDIENTE_ETAPA: { type: ObjectId, ref: 'ExpedienteEtapa' },
  ID_USUARIO_AUTOR: { type: ObjectId, ref: 'User' }, CONTENIDO: { type: String, required: true },
  ID_COMENTARIO_PADRE: { type: ObjectId, ref: 'ComentarioTarea' }, MENCIONES: [{ type: ObjectId, ref: 'User' }],
  EDITADO: { type: Boolean, default: false }, FECHA_EDICION: Date, ACTIVE: { type: Boolean, default: true },
}, opts);

const ChecklistTareaSchema = new Schema({
  ID_TAREA: { type: ObjectId, ref: 'Tarea', index: true }, TITULO: { type: String, required: true }, ORDEN: Number,
  COMPLETADO: { type: Boolean, default: false }, ID_USUARIO_COMPLETO: { type: ObjectId, ref: 'User' },
  FECHA_COMPLETADO: Date, ID_USUARIO_ASIGNADO: { type: ObjectId, ref: 'User' }, FECHA_LIMITE: Date, ACTIVE: { type: Boolean, default: true },
}, opts);

const AdjuntoTareaSchema = new Schema({
  TIPO_ENTIDAD: { type: String, enum: ['TAREA', 'EXPEDIENTE_ETAPA', 'COMENTARIO'] },
  ID_TAREA: { type: ObjectId, ref: 'Tarea' }, ID_EXPEDIENTE_ETAPA: { type: ObjectId, ref: 'ExpedienteEtapa' },
  ID_COMENTARIO: { type: ObjectId, ref: 'ComentarioTarea' }, NOMBRE_ARCHIVO: String, URL_ARCHIVO: String,
  MIME_TYPE: String, TAMANIO_BYTES: Number, ID_USUARIO_SUBIO: { type: ObjectId, ref: 'User' },
  ID_DOCUMENTO_FORMAL: { type: ObjectId, ref: 'Documento' }, ES_PRIVADO: { type: Boolean, default: false }, ACTIVE: { type: Boolean, default: true },
}, opts);

const TareaDependenciaSchema = new Schema({
  TIPO_ENTIDAD_ORIGEN: { type: String, enum: ['TAREA', 'EXPEDIENTE_ETAPA'] }, ID_ORIGEN: { type: ObjectId, required: true },
  TIPO_ENTIDAD_DESTINO: { type: String, enum: ['TAREA', 'EXPEDIENTE_ETAPA'] }, ID_DESTINO: { type: ObjectId, required: true },
  TIPO_DEPENDENCIA: { type: String, enum: ['FS', 'SS', 'FF', 'SF'], default: 'FS' },
  DIAS_LAG: { type: Number, default: 0 }, ES_BLOQUEANTE: { type: Boolean, default: true },
  ID_USUARIO_CREADOR: { type: ObjectId, ref: 'User' }, OBSERVACIONES: String, ACTIVE: { type: Boolean, default: true },
}, opts);

/* ============ EXPORTS ============ */
module.exports = {
  Role: safe('Role', RoleSchema),
  TipoProceso: safe('TipoProceso', TipoProcesoSchema),
  SubtipoProceso: safe('SubtipoProceso', SubtipoProcesoSchema),
  TipoPretension: safe('TipoPretension', TipoPretensionSchema),
  TipoProcSubtipoProcTipoPre: safe('TipoProcSubtipoProcTipoPre', TipoProcSubtipoProcTipoPreSchema),
  Instancia: safe('Instancia', InstanciaSchema),
  TipoActuacion: safe('TipoActuacion', TipoActuacionSchema),
  TipoDocumento: safe('TipoDocumento', TipoDocumentoSchema),
  TipoNotificacion: safe('TipoNotificacion', TipoNotificacionSchema),
  MedioNotificacion: safe('MedioNotificacion', MedioNotificacionSchema),
  EstadoProceso: safe('EstadoProceso', EstadoProcesoSchema),
  EstadoEtapa: safe('EstadoEtapa', EstadoEtapaSchema),
  EstadoTarea: safe('EstadoTarea', EstadoTareaSchema),
  Prioridad: safe('Prioridad', PrioridadSchema),
  User: safe('User', UserSchema),
  Expediente: safe('Expediente', ExpedienteSchema),
  EtapaProcesal: safe('EtapaProcesal', EtapaProcesalSchema),
  IterProcesalPlantilla: safe('IterProcesalPlantilla', IterProcesalPlantillaSchema),
  TareaPlantilla: safe('TareaPlantilla', TareaPlantillaSchema),
  ExpedienteEtapa: safe('ExpedienteEtapa', ExpedienteEtapaSchema),
  Tarea: safe('Tarea', TareaSchema),
  Actuacion: safe('Actuacion', ActuacionSchema),
  Notificacion: safe('Notificacion', NotificacionSchema),
  Audiencia: safe('Audiencia', AudienciaSchema),
  Documento: safe('Documento', DocumentoSchema),
  Honorario: safe('Honorario', HonorarioSchema),
  Pago: safe('Pago', PagoSchema),
  GastoProceso: safe('GastoProceso', GastoProcesoSchema),
  TableroKanban: safe('TableroKanban', TableroKanbanSchema),
  ColumnaKanban: safe('ColumnaKanban', ColumnaKanbanSchema),
  TareaKanbanPosition: safe('TareaKanbanPosition', TareaKanbanPositionSchema),
  Etiqueta: safe('Etiqueta', EtiquetaSchema),
  TareaEtiqueta: safe('TareaEtiqueta', TareaEtiquetaSchema),
  ComentarioTarea: safe('ComentarioTarea', ComentarioTareaSchema),
  ChecklistTarea: safe('ChecklistTarea', ChecklistTareaSchema),
  AdjuntoTarea: safe('AdjuntoTarea', AdjuntoTareaSchema),
  Tarea_Dependencia: safe('TareaDependencia', TareaDependenciaSchema),
};
