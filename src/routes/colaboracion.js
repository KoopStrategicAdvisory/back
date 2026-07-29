const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  Etiqueta, TareaEtiqueta, ComentarioTarea, ChecklistTarea, AdjuntoTarea, Tarea_Dependencia,
} = require('../models/koop.models');

/* ---- ETIQUETAS ---- */
router.get('/etiquetas', authenticate, async (req, res) => {
  try {
    res.json(await Etiqueta.find({ ACTIVE: true }).lean());
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.get('/etiquetas/:id', authenticate, async (req, res) => {
  try {
    const doc = await Etiqueta.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ message: 'Etiqueta no encontrada.' });
    res.json(doc);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/etiquetas', authenticate, async (req, res) => {
  try {
    res.status(201).json(await Etiqueta.create({ ...req.body, ID_USUARIO_CREADOR: req.user.sub }));
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.put('/etiquetas/:id', authenticate, async (req, res) => {
  try {
    const doc = await Etiqueta.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ message: 'Etiqueta no encontrada.' });
    res.json(doc);
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.delete('/etiquetas/:id', authenticate, async (req, res) => {
  try {
    const doc = await Etiqueta.findByIdAndUpdate(req.params.id, { ACTIVE: false }, { new: true });
    if (!doc) return res.status(404).json({ message: 'Etiqueta no encontrada.' });
    res.json({ message: 'Etiqueta desactivada.' });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* ---- TAREA-ETIQUETA (asignación) ---- */
router.get('/tarea-etiquetas', authenticate, async (req, res) => {
  try {
    const filter = { ACTIVE: true };
    if (req.query.id_tarea) filter.ID_TAREA = req.query.id_tarea;
    if (req.query.id_etapa) filter.ID_EXPEDIENTE_ETAPA = req.query.id_etapa;
    res.json(await TareaEtiqueta.find(filter).populate('ID_ETIQUETA').lean());
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/tarea-etiquetas', authenticate, async (req, res) => {
  try {
    res.status(201).json(await TareaEtiqueta.create({ ...req.body, ID_USUARIO_AGREGO: req.user.sub }));
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.delete('/tarea-etiquetas/:id', authenticate, async (req, res) => {
  try {
    const doc = await TareaEtiqueta.findByIdAndUpdate(req.params.id, { ACTIVE: false }, { new: true });
    if (!doc) return res.status(404).json({ message: 'No encontrado.' });
    res.json({ message: 'Eliminado.' });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* ---- COMENTARIOS ---- */
router.get('/comentarios', authenticate, async (req, res) => {
  try {
    const { id_tarea, id_etapa } = req.query;
    if (!id_tarea && !id_etapa) return res.status(400).json({ message: 'Se requiere id_tarea o id_etapa.' });
    const filter = { ACTIVE: true };
    if (id_tarea) filter.ID_TAREA = id_tarea;
    if (id_etapa) filter.ID_EXPEDIENTE_ETAPA = id_etapa;
    const data = await ComentarioTarea.find(filter)
      .populate('ID_USUARIO_AUTOR', 'NOMBRE email foto_url')
      .sort({ CREATED_AT: 1 }).lean();
    res.json(data);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/comentarios', authenticate, async (req, res) => {
  try {
    res.status(201).json(await ComentarioTarea.create({ ...req.body, ID_USUARIO_AUTOR: req.user.sub }));
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.put('/comentarios/:id', authenticate, async (req, res) => {
  try {
    const c = await ComentarioTarea.findById(req.params.id);
    if (!c) return res.status(404).json({ message: 'Comentario no encontrado.' });
    if (String(c.ID_USUARIO_AUTOR) !== req.user.sub) {
      return res.status(403).json({ message: 'Solo el autor puede editar el comentario.' });
    }
    const doc = await ComentarioTarea.findByIdAndUpdate(
      req.params.id,
      { CONTENIDO: req.body.CONTENIDO, EDITADO: true, FECHA_EDICION: new Date() },
      { new: true }
    );
    res.json(doc);
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.delete('/comentarios/:id', authenticate, async (req, res) => {
  try {
    const c = await ComentarioTarea.findById(req.params.id);
    if (!c) return res.status(404).json({ message: 'Comentario no encontrado.' });
    const roles = (req.user.roles || []).map(r => r.toLowerCase());
    if (!roles.includes('admin') && String(c.ID_USUARIO_AUTOR) !== req.user.sub) {
      return res.status(403).json({ message: 'No autorizado.' });
    }
    await ComentarioTarea.findByIdAndUpdate(req.params.id, { ACTIVE: false });
    res.json({ message: 'Comentario eliminado.' });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* ---- CHECKLIST ---- */
router.get('/checklists/:tareaId', authenticate, async (req, res) => {
  try {
    res.json(await ChecklistTarea.find({ ID_TAREA: req.params.tareaId, ACTIVE: true }).sort({ ORDEN: 1 }).lean());
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/checklists', authenticate, async (req, res) => {
  try {
    res.status(201).json(await ChecklistTarea.create(req.body));
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.put('/checklists/:id', authenticate, async (req, res) => {
  try {
    const update = { ...req.body };
    if (req.body.COMPLETADO && !req.body.ID_USUARIO_COMPLETO) {
      update.ID_USUARIO_COMPLETO = req.user.sub;
      update.FECHA_COMPLETADO = new Date();
    }
    const doc = await ChecklistTarea.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ message: 'No encontrado.' });
    res.json(doc);
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.delete('/checklists/:id', authenticate, async (req, res) => {
  try {
    const doc = await ChecklistTarea.findByIdAndUpdate(req.params.id, { ACTIVE: false }, { new: true });
    if (!doc) return res.status(404).json({ message: 'No encontrado.' });
    res.json({ message: 'Item eliminado.' });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* ---- ADJUNTOS ---- */
router.get('/adjuntos', authenticate, async (req, res) => {
  try {
    const filter = { ACTIVE: true };
    if (req.query.id_tarea) filter.ID_TAREA = req.query.id_tarea;
    if (req.query.id_etapa) filter.ID_EXPEDIENTE_ETAPA = req.query.id_etapa;
    res.json(await AdjuntoTarea.find(filter).populate('ID_USUARIO_SUBIO', 'NOMBRE email').lean());
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/adjuntos', authenticate, async (req, res) => {
  try {
    res.status(201).json(await AdjuntoTarea.create({ ...req.body, ID_USUARIO_SUBIO: req.user.sub }));
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.delete('/adjuntos/:id', authenticate, async (req, res) => {
  try {
    const doc = await AdjuntoTarea.findByIdAndUpdate(req.params.id, { ACTIVE: false }, { new: true });
    if (!doc) return res.status(404).json({ message: 'No encontrado.' });
    res.json({ message: 'Adjunto eliminado.' });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* ---- DEPENDENCIAS ---- */
router.get('/dependencias', authenticate, async (req, res) => {
  try {
    const filter = { ACTIVE: true };
    if (req.query.id_origen) filter.ID_ORIGEN = req.query.id_origen;
    if (req.query.id_destino) filter.ID_DESTINO = req.query.id_destino;
    res.json(await Tarea_Dependencia.find(filter).lean());
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/dependencias', authenticate, async (req, res) => {
  try {
    res.status(201).json(await Tarea_Dependencia.create({ ...req.body, ID_USUARIO_CREADOR: req.user.sub }));
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.delete('/dependencias/:id', authenticate, async (req, res) => {
  try {
    const doc = await Tarea_Dependencia.findByIdAndUpdate(req.params.id, { ACTIVE: false }, { new: true });
    if (!doc) return res.status(404).json({ message: 'No encontrado.' });
    res.json({ message: 'Dependencia eliminada.' });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
