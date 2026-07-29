const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const { IterProcesalPlantilla, TareaPlantilla } = require('../models/koop.models');

/* ---- ITER PROCESAL PLANTILLAS ---- */
router.get('/plantillas', authenticate, async (req, res) => {
  try {
    const filter = { ACTIVE: true };
    if (req.query.id_tipo) filter.ID_TIPO_PROC_SUBTIPO_PROC_TIPO_PRE = req.query.id_tipo;
    const data = await IterProcesalPlantilla.find(filter)
      .populate('ID_TIPO_PROC_SUBTIPO_PROC_TIPO_PRE').populate('ID_ETAPA').populate('ID_INSTANCIA')
      .sort({ ORDEN: 1 }).lean();
    res.json(data);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.get('/plantillas/:id', authenticate, async (req, res) => {
  try {
    const doc = await IterProcesalPlantilla.findById(req.params.id)
      .populate('ID_TIPO_PROC_SUBTIPO_PROC_TIPO_PRE').populate('ID_ETAPA').lean();
    if (!doc) return res.status(404).json({ message: 'No encontrado.' });
    res.json(doc);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/plantillas', authenticate, requireAdmin, async (req, res) => {
  try {
    const doc = await IterProcesalPlantilla.create(req.body);
    res.status(201).json(doc);
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.put('/plantillas/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const doc = await IterProcesalPlantilla.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ message: 'No encontrado.' });
    res.json(doc);
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.delete('/plantillas/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const doc = await IterProcesalPlantilla.findByIdAndUpdate(req.params.id, { ACTIVE: false }, { new: true });
    if (!doc) return res.status(404).json({ message: 'No encontrado.' });
    res.json({ message: 'Desactivado.' });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* ---- TAREA PLANTILLAS ---- */
router.get('/tareas-plantilla', authenticate, async (req, res) => {
  try {
    const filter = { ACTIVE: true };
    if (req.query.id_iter) filter.ID_ITER_PLANTILLA = req.query.id_iter;
    const data = await TareaPlantilla.find(filter)
      .populate('ID_ITER_PLANTILLA').populate('ID_PRIORIDAD').populate('ID_ROL_RESPONSABLE').lean();
    res.json(data);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.get('/tareas-plantilla/:id', authenticate, async (req, res) => {
  try {
    const doc = await TareaPlantilla.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ message: 'No encontrado.' });
    res.json(doc);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/tareas-plantilla', authenticate, requireAdmin, async (req, res) => {
  try {
    const doc = await TareaPlantilla.create(req.body);
    res.status(201).json(doc);
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.put('/tareas-plantilla/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const doc = await TareaPlantilla.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ message: 'No encontrado.' });
    res.json(doc);
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.delete('/tareas-plantilla/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const doc = await TareaPlantilla.findByIdAndUpdate(req.params.id, { ACTIVE: false }, { new: true });
    if (!doc) return res.status(404).json({ message: 'No encontrado.' });
    res.json({ message: 'Desactivado.' });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
