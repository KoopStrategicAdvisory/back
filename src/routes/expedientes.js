const express = require('express');
const router = express.Router();
const { authenticate, requireRoles } = require('../middleware/auth');
const { Expediente, ExpedienteEtapa } = require('../models/koop.models');

const canWrite = requireRoles('admin', 'lawyer');

/* ---- EXPEDIENTES ---- */
router.get('/', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 20, cliente, contraparte, search } = req.query;
    const filter = { active: true };
    if (cliente) filter.cliente = new RegExp(cliente, 'i');
    if (contraparte) filter.contraparte = new RegExp(contraparte, 'i');
    if (search) filter.$or = [
      { numero_de_expediente: new RegExp(search, 'i') },
      { cliente: new RegExp(search, 'i') },
      { contraparte: new RegExp(search, 'i') },
    ];
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      Expediente.find(filter)
        .populate('id_usuario', 'NOMBRE email')
        .populate('ID_TIPO_PROC_SUBTIPO_PROC_TIPO_PRE')
        .skip(+skip).limit(+limit).lean(),
      Expediente.countDocuments(filter),
    ]);
    res.json({ data, total, page: +page, limit: +limit });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const doc = await Expediente.findById(req.params.id)
      .populate('id_usuario', 'NOMBRE email')
      .populate('ID_TIPO_PROC_SUBTIPO_PROC_TIPO_PRE').lean();
    if (!doc) return res.status(404).json({ message: 'Expediente no encontrado.' });
    res.json(doc);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/', authenticate, canWrite, async (req, res) => {
  try {
    const doc = await Expediente.create({ ...req.body, id_usuario: req.user.sub });
    res.status(201).json(doc);
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ message: 'Número de expediente ya existe.' });
    res.status(400).json({ message: e.message });
  }
});

router.put('/:id', authenticate, canWrite, async (req, res) => {
  try {
    const doc = await Expediente.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ message: 'Expediente no encontrado.' });
    res.json(doc);
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.delete('/:id', authenticate, requireRoles('admin'), async (req, res) => {
  try {
    const doc = await Expediente.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
    if (!doc) return res.status(404).json({ message: 'Expediente no encontrado.' });
    res.json({ message: 'Expediente desactivado.' });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* ---- ETAPAS DEL EXPEDIENTE ---- */
router.get('/:id/etapas', authenticate, async (req, res) => {
  try {
    const data = await ExpedienteEtapa.find({ ID_EXPEDIENTE: req.params.id, ACTIVE: true })
      .populate('ID_ETAPA').populate('ID_INSTANCIA').populate('ID_ESTADO_ETAPA')
      .populate('ID_USUARIO_RESPONSABLE', 'NOMBRE email').sort({ ORDEN: 1 }).lean();
    res.json(data);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/:id/etapas', authenticate, canWrite, async (req, res) => {
  try {
    const doc = await ExpedienteEtapa.create({ ...req.body, ID_EXPEDIENTE: req.params.id });
    res.status(201).json(doc);
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.put('/:id/etapas/:etapaId', authenticate, canWrite, async (req, res) => {
  try {
    const doc = await ExpedienteEtapa.findOneAndUpdate(
      { _id: req.params.etapaId, ID_EXPEDIENTE: req.params.id },
      req.body, { new: true, runValidators: true }
    );
    if (!doc) return res.status(404).json({ message: 'Etapa no encontrada.' });
    res.json(doc);
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.delete('/:id/etapas/:etapaId', authenticate, canWrite, async (req, res) => {
  try {
    const doc = await ExpedienteEtapa.findOneAndUpdate(
      { _id: req.params.etapaId, ID_EXPEDIENTE: req.params.id },
      { ACTIVE: false }, { new: true }
    );
    if (!doc) return res.status(404).json({ message: 'Etapa no encontrada.' });
    res.json({ message: 'Etapa desactivada.' });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
