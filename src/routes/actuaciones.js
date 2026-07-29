const express = require('express');
const router = express.Router();
const { authenticate, requireRoles } = require('../middleware/auth');
const { Actuacion } = require('../models/koop.models');

const canWrite = requireRoles('admin', 'lawyer');

router.get('/', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 20, id_expediente, id_tipo } = req.query;
    const filter = { ACTIVE: true };
    if (id_expediente) filter.ID_EXPEDIENTE = id_expediente;
    if (id_tipo) filter.ID_TIPO_ACTUACION = id_tipo;
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      Actuacion.find(filter)
        .populate('ID_EXPEDIENTE', 'numero_de_expediente cliente')
        .populate('ID_TIPO_ACTUACION').populate('ID_USUARIO_REGISTRA', 'NOMBRE email')
        .sort({ FECHA: -1 }).skip(+skip).limit(+limit).lean(),
      Actuacion.countDocuments(filter),
    ]);
    res.json({ data, total, page: +page, limit: +limit });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const doc = await Actuacion.findById(req.params.id)
      .populate('ID_EXPEDIENTE').populate('ID_TIPO_ACTUACION')
      .populate('ID_USUARIO_REGISTRA', 'NOMBRE email').lean();
    if (!doc) return res.status(404).json({ message: 'Actuación no encontrada.' });
    res.json(doc);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/', authenticate, canWrite, async (req, res) => {
  try {
    const doc = await Actuacion.create({ ...req.body, ID_USUARIO_REGISTRA: req.user.sub });
    res.status(201).json(doc);
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.put('/:id', authenticate, canWrite, async (req, res) => {
  try {
    const doc = await Actuacion.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ message: 'Actuación no encontrada.' });
    res.json(doc);
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.delete('/:id', authenticate, canWrite, async (req, res) => {
  try {
    const doc = await Actuacion.findByIdAndUpdate(req.params.id, { ACTIVE: false }, { new: true });
    if (!doc) return res.status(404).json({ message: 'Actuación no encontrada.' });
    res.json({ message: 'Actuación desactivada.' });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
