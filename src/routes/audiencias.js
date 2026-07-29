const express = require('express');
const router = express.Router();
const { authenticate, requireRoles } = require('../middleware/auth');
const { Audiencia } = require('../models/koop.models');

const canWrite = requireRoles('admin', 'lawyer');

router.get('/', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 20, id_expediente, estado, desde, hasta } = req.query;
    const filter = { ACTIVE: true };
    if (id_expediente) filter.ID_EXPEDIENTE = id_expediente;
    if (estado) filter.ESTADO = estado;
    if (desde || hasta) {
      filter.FECHA_PROGRAMADA = {};
      if (desde) filter.FECHA_PROGRAMADA.$gte = new Date(desde);
      if (hasta) filter.FECHA_PROGRAMADA.$lte = new Date(hasta);
    }
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      Audiencia.find(filter)
        .populate('ID_EXPEDIENTE', 'numero_de_expediente cliente')
        .populate('ID_USUARIO_RESPONSABLE', 'NOMBRE email')
        .sort({ FECHA_PROGRAMADA: 1 }).skip(+skip).limit(+limit).lean(),
      Audiencia.countDocuments(filter),
    ]);
    res.json({ data, total, page: +page, limit: +limit });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const doc = await Audiencia.findById(req.params.id)
      .populate('ID_EXPEDIENTE').populate('ID_USUARIO_RESPONSABLE', 'NOMBRE email').lean();
    if (!doc) return res.status(404).json({ message: 'Audiencia no encontrada.' });
    res.json(doc);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/', authenticate, canWrite, async (req, res) => {
  try {
    const doc = await Audiencia.create(req.body);
    res.status(201).json(doc);
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.put('/:id', authenticate, canWrite, async (req, res) => {
  try {
    const doc = await Audiencia.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ message: 'Audiencia no encontrada.' });
    res.json(doc);
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.delete('/:id', authenticate, canWrite, async (req, res) => {
  try {
    const doc = await Audiencia.findByIdAndUpdate(req.params.id, { ACTIVE: false }, { new: true });
    if (!doc) return res.status(404).json({ message: 'Audiencia no encontrada.' });
    res.json({ message: 'Audiencia desactivada.' });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
