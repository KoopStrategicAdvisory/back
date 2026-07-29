const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const {
  Role, TipoProceso, SubtipoProceso, TipoPretension, TipoProcSubtipoProcTipoPre,
  Instancia, TipoActuacion, TipoDocumento, TipoNotificacion, MedioNotificacion,
  EstadoProceso, EstadoEtapa, EstadoTarea, Prioridad, EtapaProcesal,
} = require('../models/koop.models');

function mkCrud(Model, activeField) {
  const r = express.Router();

  r.get('/', authenticate, async (req, res) => {
    try {
      const { page = 1, limit = 100, soloActivos = 'true' } = req.query;
      const filter = activeField && soloActivos === 'true' ? { [activeField]: true } : {};
      const skip = (page - 1) * limit;
      const [data, total] = await Promise.all([
        Model.find(filter).skip(+skip).limit(+limit).lean(),
        Model.countDocuments(filter),
      ]);
      res.json({ data, total, page: +page, limit: +limit });
    } catch (e) { res.status(500).json({ message: e.message }); }
  });

  r.get('/:id', authenticate, async (req, res) => {
    try {
      const doc = await Model.findById(req.params.id).lean();
      if (!doc) return res.status(404).json({ message: 'No encontrado.' });
      res.json(doc);
    } catch (e) { res.status(500).json({ message: e.message }); }
  });

  r.post('/', authenticate, requireAdmin, async (req, res) => {
    try {
      const doc = await Model.create(req.body);
      res.status(201).json(doc);
    } catch (e) {
      if (e.code === 11000) return res.status(409).json({ message: 'Ya existe.' });
      res.status(400).json({ message: e.message });
    }
  });

  r.put('/:id', authenticate, requireAdmin, async (req, res) => {
    try {
      const doc = await Model.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
      if (!doc) return res.status(404).json({ message: 'No encontrado.' });
      res.json(doc);
    } catch (e) { res.status(400).json({ message: e.message }); }
  });

  r.delete('/:id', authenticate, requireAdmin, async (req, res) => {
    try {
      const doc = activeField
        ? await Model.findByIdAndUpdate(req.params.id, { [activeField]: false }, { new: true })
        : await Model.findByIdAndDelete(req.params.id);
      if (!doc) return res.status(404).json({ message: 'No encontrado.' });
      res.json({ message: 'Eliminado.' });
    } catch (e) { res.status(500).json({ message: e.message }); }
  });

  return r;
}

router.use('/roles',                   mkCrud(Role, 'Active'));
router.use('/tipos-proceso',           mkCrud(TipoProceso, 'ACTIVE'));
router.use('/subtipos-proceso',        mkCrud(SubtipoProceso, 'ACTIVE'));
router.use('/tipos-pretension',        mkCrud(TipoPretension, null));
router.use('/proc-subtipo-pretension', mkCrud(TipoProcSubtipoProcTipoPre, 'ACTIVE'));
router.use('/instancias',              mkCrud(Instancia, null));
router.use('/tipos-actuacion',         mkCrud(TipoActuacion, 'ACTIVE'));
router.use('/tipos-documento',         mkCrud(TipoDocumento, 'ACTIVE'));
router.use('/tipos-notificacion',      mkCrud(TipoNotificacion, 'ACTIVE'));
router.use('/medios-notificacion',     mkCrud(MedioNotificacion, 'ACTIVE'));
router.use('/estados-proceso',         mkCrud(EstadoProceso, 'ACTIVE'));
router.use('/estados-etapa',           mkCrud(EstadoEtapa, 'ACTIVE'));
router.use('/estados-tarea',           mkCrud(EstadoTarea, 'ACTIVE'));
router.use('/prioridades',             mkCrud(Prioridad, 'ACTIVE'));
router.use('/etapas-procesales',       mkCrud(EtapaProcesal, 'ACTIVE'));

module.exports = router;
