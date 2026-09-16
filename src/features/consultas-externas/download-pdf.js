'use strict';
const PDFDocument = require('pdfkit');
const { authenticate, requireRoles } = require('../../middleware/auth');
const { consultasExternas } = require('../../repositories');

const RESULTADO_LABEL = {
  sin_movimiento: 'Sin movimiento',
  actuacion_nueva: 'Actuación nueva',
  termino_corriendo: 'Término corriendo',
};

// Genera la "constancia" en PDF de que los procesos activos se revisaron
// ese dia en los portales externos — quien lo hizo, cuando, y que encontro.
async function handler(req, res, next) {
  try {
    const fecha = req.query.fecha || new Date().toISOString().slice(0, 10);
    const rows = await consultasExternas.findByFecha(fecha);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="bitacora-diaria-${fecha}.pdf"`);

    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);

    doc.fontSize(17).font('Helvetica-Bold').text('Bitácora diaria de consultas externas', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').fillColor('#555').text('Koop Strategic Advisory', { align: 'center' });
    doc.moveDown(1);
    doc.fillColor('#000').fontSize(11).font('Helvetica-Bold').text(`Fecha: ${fecha}`);
    doc.fontSize(10).font('Helvetica').text(`Total de registros: ${rows.length}`);
    doc.moveDown(1);

    if (rows.length === 0) {
      doc.fontSize(11).fillColor('#555').text('No se registraron consultas para esta fecha.');
    }

    rows.forEach((r, i) => {
      if (i > 0) doc.moveDown(0.6);
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#000')
        .text(`${i + 1}. Radicado ${r.numero_radicado}${r.numero_de_expediente ? ` — Expediente ${r.numero_de_expediente}` : ''}`);
      doc.fontSize(9.5).font('Helvetica').fillColor('#444')
        .text(`Resultado: ${RESULTADO_LABEL[r.resultado] || r.resultado}   ·   Revisado por: ${r.nombre_usuario || '—'}   ·   Hora: ${new Date(r.created_at).toLocaleString('es-CO')}`);
      if (r.observacion) {
        doc.fontSize(9.5).fillColor('#222').text(`Observación: ${r.observacion}`);
      }
      doc.moveTo(doc.x, doc.y + 4).lineTo(545, doc.y + 4).strokeColor('#ddd').stroke();
    });

    doc.end();
  } catch (err) { next(err); }
}

module.exports = {
  method: 'GET', path: '/pdf',
  middleware: [authenticate, requireRoles('admin', 'lawyer')],
  handler,
};
