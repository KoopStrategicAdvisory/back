const express = require('express');
const router = express.Router();
const { authenticate, requireRoles } = require('../middleware/auth');
const { Tarea } = require('../models/koop.models');

const canWrite = requireRoles('admin', 'lawyer');

router.get('/mis-tareas', authenticate, async (req, res) => {
  try {
    const data = await Tarea.find({ ID_USUARIO_ASIGNADO: req.user.sub, ACTIVE: true })
      .populate('ID_EXPEDIENTE', 'numero_de_expediente cliente')
      .populate('ID_ESTADO_TAREA').populate('ID_PRIORIDAD')
      .sort({ FECHA_LIMITE: 1 }).lean();
    res.json(data);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.get('/', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 20, id_expediente, id_asignado, id_estado, vencidas } = req.query;
    const filter = { ACTIVE: true };
    if (id_expediente) filter.ID_EXPEDIENTE = id_expediente;
    if (id_asignado) filter.ID_USUARIO_ASIGNADO = id_asignado;
    if (id_estado) filter.ID_ESTADO_TAREA = id_estado;
    if (vencidas === 'true') filter.FECHA_LIMITE = { $lt: new Date() };
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      Tarea.find(filter)
        .populate('ID_EXPEDIENTE', 'numero_de_expediente cliente')
        .populate('ID_USUARIO_ASIGNADO', 'NOMBRE email')
        .populate('ID_ESTADO_TAREA').populate('ID_PRIORIDAD')
        .skip(+skip).limit(+limit).lean(),
      Tarea.countDocuments(filter),
    ]);
    res.json({ data, total, page: +page, limit: +limit });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const doc = await Tarea.findById(req.params.id)
      .populate('ID_EXPEDIENTE').populate('ID_USUARIO_ASIGNADO', 'NOMBRE email')
      .populate('ID_USUARIO_CREADOR', 'NOMBRE email')
      .populate('ID_ESTADO_TAREA').populate('ID_PRIORIDAD').lean();
    if (!doc) return res.status(404).json({ message: 'Tarea no encontrada.' });
    res.json(doc);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/', authenticate, canWrite, async (req, res) => {
  try {
    const doc = await Tarea.create({ ...req.body, ID_USUARIO_CREADOR: req.user.sub });
    res.status(201).json(doc);
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const tarea = await Tarea.findById(req.params.id);
    if (!tarea) return res.status(404).json({ message: 'Tarea no encontrada.' });
    const roles = (req.user.roles || []).map(r => r.toLowerCase());
    const isAssigned = String(tarea.ID_USUARIO_ASIGNADO) === req.user.sub;
    if (!roles.includes('admin') && !roles.includes('lawyer') && !isAssigned) {
      return res.status(403).json({ message: 'No autorizado.' });
    }
    const updated = await Tarea.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    res.json(updated);
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.delete('/:id', authenticate, canWrite, async (req, res) => {
  try {
    const doc = await Tarea.findByIdAndUpdate(req.params.id, { ACTIVE: false }, { new: true });
    if (!doc) return res.status(404).json({ message: 'Tarea no encontrada.' });
    res.json({ message: 'Tarea desactivada.' });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
