const express = require('express');
const router = express.Router();
const { authenticate, requireRoles } = require('../middleware/auth');
const { Honorario, Pago, GastoProceso } = require('../models/koop.models');

const canWrite = requireRoles('admin', 'lawyer');
const onlyAdmin = requireRoles('admin');

function mkCrud(Model) {
  const r = express.Router();

  r.get('/', authenticate, canWrite, async (req, res) => {
    try {
      const { page = 1, limit = 20, id_expediente } = req.query;
      const filter = { ACTIVE: true };
      if (id_expediente) filter.ID_EXPEDIENTE = id_expediente;
      const skip = (page - 1) * limit;
      const [data, total] = await Promise.all([
        Model.find(filter)
          .populate('ID_EXPEDIENTE', 'numero_de_expediente cliente')
          .populate('ID_USUARIO', 'NOMBRE email')
          .skip(+skip).limit(+limit).lean(),
        Model.countDocuments(filter),
      ]);
      res.json({ data, total, page: +page, limit: +limit });
    } catch (e) { res.status(500).json({ message: e.message }); }
  });

  r.get('/:id', authenticate, canWrite, async (req, res) => {
    try {
      const doc = await Model.findById(req.params.id)
        .populate('ID_EXPEDIENTE').populate('ID_USUARIO', 'NOMBRE email').lean();
      if (!doc) return res.status(404).json({ message: 'No encontrado.' });
      res.json(doc);
    } catch (e) { res.status(500).json({ message: e.message }); }
  });

  r.post('/', authenticate, canWrite, async (req, res) => {
    try {
      const doc = await Model.create({ ...req.body, ID_USUARIO: req.user.sub });
      res.status(201).json(doc);
    } catch (e) { res.status(400).json({ message: e.message }); }
  });

  r.put('/:id', authenticate, canWrite, async (req, res) => {
    try {
      const doc = await Model.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
      if (!doc) return res.status(404).json({ message: 'No encontrado.' });
      res.json(doc);
    } catch (e) { res.status(400).json({ message: e.message }); }
  });

  r.delete('/:id', authenticate, onlyAdmin, async (req, res) => {
    try {
      const doc = await Model.findByIdAndUpdate(req.params.id, { ACTIVE: false }, { new: true });
      if (!doc) return res.status(404).json({ message: 'No encontrado.' });
      res.json({ message: 'Desactivado.' });
    } catch (e) { res.status(500).json({ message: e.message }); }
  });

  return r;
}

router.use('/honorarios', mkCrud(Honorario));
router.use('/pagos',      mkCrud(Pago));
router.use('/gastos',     mkCrud(GastoProceso));

module.exports = router;
