const express = require('express');
const router = express.Router();
const { authenticate, requireRoles } = require('../middleware/auth');
const { Documento } = require('../models/koop.models');

const canWrite = requireRoles('admin', 'lawyer');

router.get('/', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 20, id_expediente, id_tipo, visibilidad_cliente } = req.query;
    const filter = { ACTIVE: true };
    if (id_expediente) filter.ID_EXPEDIENTE = id_expediente;
    if (id_tipo) filter.ID_TIPO_DOCUMENTO = id_tipo;
    if (visibilidad_cliente !== undefined) filter.VISIBILIDAD_CLIENTE = visibilidad_cliente === 'true';
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      Documento.find(filter)
        .populate('ID_EXPEDIENTE', 'numero_de_expediente cliente')
        .populate('ID_TIPO_DOCUMENTO').populate('ID_USUARIO_CARGA', 'NOMBRE email')
        .sort({ FECHA_CARGA: -1 }).skip(+skip).limit(+limit).lean(),
      Documento.countDocuments(filter),
    ]);
    res.json({ data, total, page: +page, limit: +limit });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const doc = await Documento.findById(req.params.id)
      .populate('ID_EXPEDIENTE').populate('ID_TIPO_DOCUMENTO')
      .populate('ID_USUARIO_CARGA', 'NOMBRE email').lean();
    if (!doc) return res.status(404).json({ message: 'Documento no encontrado.' });
    res.json(doc);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/', authenticate, canWrite, async (req, res) => {
  try {
    const doc = await Documento.create({ ...req.body, ID_USUARIO_CARGA: req.user.sub });
    res.status(201).json(doc);
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.put('/:id', authenticate, canWrite, async (req, res) => {
  try {
    const doc = await Documento.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ message: 'Documento no encontrado.' });
    res.json(doc);
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.delete('/:id', authenticate, canWrite, async (req, res) => {
  try {
    const doc = await Documento.findByIdAndUpdate(req.params.id, { ACTIVE: false }, { new: true });
    if (!doc) return res.status(404).json({ message: 'Documento no encontrado.' });
    res.json({ message: 'Documento desactivado.' });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
