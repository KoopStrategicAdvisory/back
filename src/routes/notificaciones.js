const express = require('express');
const router = express.Router();
const { authenticate, requireRoles } = require('../middleware/auth');
const { Notificacion } = require('../models/koop.models');

const canWrite = requireRoles('admin', 'lawyer');

router.get('/', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 20, id_expediente, estado } = req.query;
    const filter = { ACTIVE: true };
    if (id_expediente) filter.ID_EXPEDIENTE = id_expediente;
    if (estado) filter.ESTADO = estado;
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      Notificacion.find(filter)
        .populate('ID_EXPEDIENTE', 'numero_de_expediente cliente')
        .populate('ID_TIPO_NOTIFICACION').populate('ID_MEDIO_NOTIFICACION')
        .sort({ FECHA_REALIZACION: -1 }).skip(+skip).limit(+limit).lean(),
      Notificacion.countDocuments(filter),
    ]);
    res.json({ data, total, page: +page, limit: +limit });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const doc = await Notificacion.findById(req.params.id)
      .populate('ID_EXPEDIENTE').populate('ID_TIPO_NOTIFICACION')
      .populate('ID_MEDIO_NOTIFICACION').populate('ID_USUARIO_REGISTRA', 'NOMBRE email').lean();
    if (!doc) return res.status(404).json({ message: 'Notificación no encontrada.' });
    res.json(doc);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/', authenticate, canWrite, async (req, res) => {
  try {
    const doc = await Notificacion.create({ ...req.body, ID_USUARIO_REGISTRA: req.user.sub });
    res.status(201).json(doc);
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.put('/:id', authenticate, canWrite, async (req, res) => {
  try {
    const doc = await Notificacion.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ message: 'Notificación no encontrada.' });
    res.json(doc);
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.delete('/:id', authenticate, canWrite, async (req, res) => {
  try {
    const doc = await Notificacion.findByIdAndUpdate(req.params.id, { ACTIVE: false }, { new: true });
    if (!doc) return res.status(404).json({ message: 'Notificación no encontrada.' });
    res.json({ message: 'Notificación desactivada.' });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
