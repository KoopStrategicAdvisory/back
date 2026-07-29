const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { TableroKanban, ColumnaKanban, TareaKanbanPosition, Tarea, ExpedienteEtapa } = require('../models/koop.models');

/* ── helpers ─────────────────────────────────────────────────── */
function canManageTablero(tablero, user) {
  const roles = (user.roles || []).map(r => r.toLowerCase());
  return roles.includes('admin') || String(tablero.ID_USUARIO_PROPIETARIO) === user.sub;
}

function puedeVerTablero(tablero, user) {
  const roles = (user.roles || []).map(r => r.toLowerCase());
  if (roles.includes('admin')) return true;
  if (tablero.ES_PUBLICO) return true;
  if (String(tablero.ID_USUARIO_PROPIETARIO) === user.sub) return true;
  return (tablero.USUARIOS_COMPARTIDOS || []).some(id => String(id) === user.sub);
}

/* ── TABLEROS ─────────────────────────────────────────────────── */
router.get('/tableros', authenticate, async (req, res) => {
  try {
    const roles = (req.user.roles || []).map(r => r.toLowerCase());
    const filter = roles.includes('admin')
      ? { ACTIVE: true }
      : {
          ACTIVE: true,
          $or: [
            { ID_USUARIO_PROPIETARIO: req.user.sub },
            { ES_PUBLICO: true },
            { USUARIOS_COMPARTIDOS: req.user.sub },
          ],
        };
    const data = await TableroKanban.find(filter)
      .populate('ID_USUARIO_PROPIETARIO', 'NOMBRE email foto_url').lean();
    res.json(data);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.get('/tableros/:id', authenticate, async (req, res) => {
  try {
    const doc = await TableroKanban.findById(req.params.id)
      .populate('ID_USUARIO_PROPIETARIO', 'NOMBRE email foto_url')
      .populate('USUARIOS_COMPARTIDOS', 'NOMBRE email foto_url').lean();
    if (!doc) return res.status(404).json({ message: 'Tablero no encontrado.' });
    if (!puedeVerTablero(doc, req.user)) return res.status(403).json({ message: 'No autorizado.' });
    res.json(doc);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ► Vista completa del tablero: columnas + tarjetas anidadas
router.get('/tableros/:id/vista', authenticate, async (req, res) => {
  try {
    const tablero = await TableroKanban.findById(req.params.id)
      .populate('ID_USUARIO_PROPIETARIO', 'NOMBRE email foto_url').lean();
    if (!tablero) return res.status(404).json({ message: 'Tablero no encontrado.' });
    if (!puedeVerTablero(tablero, req.user)) return res.status(403).json({ message: 'No autorizado.' });

    const columnas = await ColumnaKanban.find({ ID_TABLERO: req.params.id, ACTIVE: true })
      .sort({ ORDEN: 1 }).lean();

    const posiciones = await TareaKanbanPosition.find({ ID_TABLERO: req.params.id, ACTIVE: true })
      .populate({
        path: 'ID_TAREA',
        select: 'TITULO DESCRIPCION FECHA_LIMITE FECHA_COMPLETADO ES_HITO_PRECLUSIVO OBSERVACIONES ACTIVE',
        populate: [
          { path: 'ID_USUARIO_ASIGNADO', select: 'NOMBRE email foto_url' },
          { path: 'ID_PRIORIDAD',        select: 'NOMBRE NIVEL COLOR' },
          { path: 'ID_ESTADO_TAREA',     select: 'NOMBRE' },
          { path: 'ID_EXPEDIENTE',       select: 'numero_de_expediente cliente contraparte' },
        ],
      })
      .populate({
        path: 'ID_EXPEDIENTE_ETAPA',
        select: 'NOMBRE_ETAPA ORDEN FECHA_VENCIMIENTO',
        populate: { path: 'ID_EXPEDIENTE', select: 'numero_de_expediente cliente' },
      })
      .lean();

    // Agrupar posiciones por columna
    const posMap = {};
    for (const p of posiciones) posMap[String(p.ID_COLUMNA)] = (posMap[String(p.ID_COLUMNA)] || []);
    for (const p of posiciones) posMap[String(p.ID_COLUMNA)].push(p);

    const resultado = columnas.map(col => ({
      ...col,
      tarjetas: (posMap[String(col._id)] || []).sort((a, b) => a.ORDEN_VERTICAL - b.ORDEN_VERTICAL),
    }));

    res.json({ tablero, columnas: resultado });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/tableros', authenticate, async (req, res) => {
  try {
    const doc = await TableroKanban.create({ ...req.body, ID_USUARIO_PROPIETARIO: req.user.sub });
    res.status(201).json(doc);
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.put('/tableros/:id', authenticate, async (req, res) => {
  try {
    const tablero = await TableroKanban.findById(req.params.id);
    if (!tablero) return res.status(404).json({ message: 'Tablero no encontrado.' });
    if (!canManageTablero(tablero, req.user)) return res.status(403).json({ message: 'No autorizado.' });
    const doc = await TableroKanban.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    res.json(doc);
  } catch (e) { res.status(400).json({ message: e.message }); }
});

// Compartir tablero con usuarios
router.patch('/tableros/:id/compartir', authenticate, async (req, res) => {
  try {
    const tablero = await TableroKanban.findById(req.params.id);
    if (!tablero) return res.status(404).json({ message: 'Tablero no encontrado.' });
    if (!canManageTablero(tablero, req.user)) return res.status(403).json({ message: 'No autorizado.' });
    const { usuarios } = req.body; // array de ObjectIds
    const doc = await TableroKanban.findByIdAndUpdate(
      req.params.id,
      { $addToSet: { USUARIOS_COMPARTIDOS: { $each: usuarios } } },
      { new: true }
    );
    res.json(doc);
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.delete('/tableros/:id', authenticate, async (req, res) => {
  try {
    const tablero = await TableroKanban.findById(req.params.id);
    if (!tablero) return res.status(404).json({ message: 'Tablero no encontrado.' });
    if (!canManageTablero(tablero, req.user)) return res.status(403).json({ message: 'No autorizado.' });
    await TableroKanban.findByIdAndUpdate(req.params.id, { ACTIVE: false });
    res.json({ message: 'Tablero desactivado.' });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* ── COLUMNAS ─────────────────────────────────────────────────── */
router.get('/tableros/:id/columnas', authenticate, async (req, res) => {
  try {
    const data = await ColumnaKanban.find({ ID_TABLERO: req.params.id, ACTIVE: true })
      .sort({ ORDEN: 1 }).lean();
    res.json(data);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/tableros/:id/columnas', authenticate, async (req, res) => {
  try {
    const doc = await ColumnaKanban.create({ ...req.body, ID_TABLERO: req.params.id });
    res.status(201).json(doc);
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.put('/tableros/:id/columnas/:colId', authenticate, async (req, res) => {
  try {
    const doc = await ColumnaKanban.findOneAndUpdate(
      { _id: req.params.colId, ID_TABLERO: req.params.id },
      req.body, { new: true, runValidators: true }
    );
    if (!doc) return res.status(404).json({ message: 'Columna no encontrada.' });
    res.json(doc);
  } catch (e) { res.status(400).json({ message: e.message }); }
});

// Reordenar columnas en lote [{ _id, ORDEN }]
router.patch('/tableros/:id/columnas/reordenar', authenticate, async (req, res) => {
  try {
    const ops = (req.body.columnas || []).map(c => ({
      updateOne: { filter: { _id: c._id, ID_TABLERO: req.params.id }, update: { ORDEN: c.ORDEN } },
    }));
    if (ops.length) await ColumnaKanban.bulkWrite(ops);
    res.json({ message: 'Columnas reordenadas.' });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.delete('/tableros/:id/columnas/:colId', authenticate, async (req, res) => {
  try {
    const doc = await ColumnaKanban.findOneAndUpdate(
      { _id: req.params.colId, ID_TABLERO: req.params.id },
      { ACTIVE: false }, { new: true }
    );
    if (!doc) return res.status(404).json({ message: 'Columna no encontrada.' });
    res.json({ message: 'Columna desactivada.' });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* ── POSICIONES (tarjetas en el tablero) ──────────────────────── */
router.get('/tableros/:id/posiciones', authenticate, async (req, res) => {
  try {
    const { id_columna } = req.query;
    const filter = { ID_TABLERO: req.params.id, ACTIVE: true };
    if (id_columna) filter.ID_COLUMNA = id_columna;
    const data = await TareaKanbanPosition.find(filter)
      .populate('ID_TAREA', 'TITULO FECHA_LIMITE ID_PRIORIDAD ID_ESTADO_TAREA')
      .populate('ID_EXPEDIENTE_ETAPA', 'NOMBRE_ETAPA FECHA_VENCIMIENTO')
      .sort({ ORDEN_VERTICAL: 1 }).lean();
    res.json(data);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// Agregar una tarjeta al tablero
router.post('/tableros/:id/posiciones', authenticate, async (req, res) => {
  try {
    const { TIPO_ENTIDAD, ID_TAREA, ID_EXPEDIENTE_ETAPA, ID_COLUMNA, ORDEN_VERTICAL } = req.body;
    if (!TIPO_ENTIDAD || !ID_COLUMNA) {
      return res.status(400).json({ message: 'TIPO_ENTIDAD e ID_COLUMNA son requeridos.' });
    }
    const columna = await ColumnaKanban.findOne({ _id: ID_COLUMNA, ID_TABLERO: req.params.id, ACTIVE: true });
    if (!columna) return res.status(404).json({ message: 'Columna no pertenece al tablero.' });

    const doc = await TareaKanbanPosition.create({
      ID_TABLERO: req.params.id,
      ID_COLUMNA,
      TIPO_ENTIDAD,
      ID_TAREA: TIPO_ENTIDAD === 'TAREA' ? ID_TAREA : undefined,
      ID_EXPEDIENTE_ETAPA: TIPO_ENTIDAD === 'EXPEDIENTE_ETAPA' ? ID_EXPEDIENTE_ETAPA : undefined,
      ORDEN_VERTICAL: ORDEN_VERTICAL ?? 0,
      ID_USUARIO_MOVIO: req.user.sub,
    });
    res.status(201).json(doc);
  } catch (e) { res.status(400).json({ message: e.message }); }
});

// Mover una tarjeta (cambio de columna / reordenamiento individual)
router.patch('/tableros/:id/posiciones/:posId', authenticate, async (req, res) => {
  try {
    const { ID_COLUMNA, ORDEN_VERTICAL } = req.body;
    const doc = await TareaKanbanPosition.findOneAndUpdate(
      { _id: req.params.posId, ID_TABLERO: req.params.id },
      { ID_COLUMNA, ORDEN_VERTICAL, ID_USUARIO_MOVIO: req.user.sub, FECHA_MOVIMIENTO: new Date() },
      { new: true, runValidators: true }
    );
    if (!doc) return res.status(404).json({ message: 'Posición no encontrada.' });
    res.json(doc);
  } catch (e) { res.status(400).json({ message: e.message }); }
});

// Mover múltiples tarjetas en lote (drag & drop)
router.put('/tableros/:id/posiciones', authenticate, async (req, res) => {
  try {
    const ops = (req.body.posiciones || []).map(p => ({
      updateOne: {
        filter: { _id: p._id, ID_TABLERO: req.params.id },
        update: {
          ID_COLUMNA: p.ID_COLUMNA,
          ORDEN_VERTICAL: p.ORDEN_VERTICAL,
          ID_USUARIO_MOVIO: req.user.sub,
          FECHA_MOVIMIENTO: new Date(),
        },
      },
    }));
    if (ops.length) await TareaKanbanPosition.bulkWrite(ops);
    res.json({ message: 'Posiciones actualizadas.', updated: ops.length });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// Quitar una tarjeta del tablero
router.delete('/tableros/:id/posiciones/:posId', authenticate, async (req, res) => {
  try {
    const doc = await TareaKanbanPosition.findOneAndUpdate(
      { _id: req.params.posId, ID_TABLERO: req.params.id },
      { ACTIVE: false }, { new: true }
    );
    if (!doc) return res.status(404).json({ message: 'Posición no encontrada.' });
    res.json({ message: 'Tarjeta quitada del tablero.' });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
