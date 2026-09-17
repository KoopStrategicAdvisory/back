'use strict';
const path = require('path');
const PDFDocument = require('pdfkit');
const { authenticate, requireRoles } = require('../../middleware/auth');
const { consultasExternas } = require('../../repositories');
const { query } = require('express-validator');
const validate = require('../../middleware/validate');

const LOGO_PATH = path.join(__dirname, '../../assets/koop-logo.png');

const RESULTADO_LABEL = {
  sin_movimiento: 'Sin movimiento',
  actuacion_nueva: 'Actuación nueva',
  termino_corriendo: 'Término corriendo',
};

const NAVY = '#0d1b2a';
const GOLD = '#c9932a';
const GREY = '#5b6472';
const LIGHT_RULE = '#e2e6ea';

function drawHeader(doc, fecha, total) {
  const top = doc.y;
  try { doc.image(LOGO_PATH, 50, 42, { width: 46 }); } catch (_) { /* logo opcional */ }

  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(GREY)
    .text('KOOP STRATEGIC ADVISORY', 108, 46, { characterSpacing: 0.6 });
  doc.font('Helvetica-Bold').fontSize(16).fillColor(NAVY)
    .text('Bitácora Diaria de Consultas Externas', 108, 58, { width: 390 });
  doc.font('Helvetica').fontSize(9).fillColor(GREY)
    .text('Constancia de revisión de procesos judiciales activos', 108, 79, { width: 390 });

  doc.moveTo(50, 108).lineTo(545, 108).lineWidth(1.4).strokeColor(GOLD).stroke();

  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(NAVY).text(`Fecha de la bitácora: ${fecha}`, 50, 118);
  doc.font('Helvetica').fontSize(9).fillColor(GREY).text(`Total de registros: ${total}`, 50, 132);
  doc.y = 152;
}

function drawFooter(doc, pageIndex, pageCount) {
  // Escribir tan cerca del borde inferior dispara el salto de pagina
  // automatico de pdfkit (cree que el texto no cabe) — se desactiva el
  // margen inferior mientras se dibuja el pie y se restaura despues.
  const originalBottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;

  const y = doc.page.height - 38;
  doc.moveTo(50, y - 8).lineTo(545, y - 8).lineWidth(0.6).strokeColor(LIGHT_RULE).stroke();
  doc.font('Helvetica').fontSize(7.5).fillColor(GREY).text(
    `Koop Strategic Advisory · Documento generado el ${new Date().toLocaleString('es-CO')}`,
    50, y, { width: 300, lineBreak: false }
  );
  doc.font('Helvetica').fontSize(7.5).fillColor(GREY).text(
    `Página ${pageIndex + 1} de ${pageCount}`,
    345, y, { width: 200, align: 'right', lineBreak: false }
  );

  doc.page.margins.bottom = originalBottom;
}

function field(doc, label, value, x, width) {
  if (!value) return;
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(GREY).text(`${label}: `, x, doc.y, { continued: true, width });
  doc.font('Helvetica').fontSize(8.5).fillColor('#222').text(value);
}

// Genera la "constancia" en PDF de que los procesos activos se revisaron
// ese dia en los portales externos — con el contexto completo del caso
// (partes, materia, portal consultado) para que el documento tenga
// sentido por si solo, no solo un radicado suelto.
async function handler(req, res, next) {
  try {
    const fecha = req.query.fecha || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
    const rows = await consultasExternas.reporteCompleto(fecha);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="bitacora-diaria-${fecha}.pdf"`);

    const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
    doc.pipe(res);

    drawHeader(doc, fecha, rows.length);

    if (rows.length === 0) {
      doc.font('Helvetica').fontSize(10).fillColor(GREY).text('No se registraron consultas para esta fecha.', 50, doc.y + 10);
    }

    rows.forEach((r, i) => {
      // Salto de pagina manual si no cabe el siguiente bloque (~140pt)
      if (doc.y > doc.page.height - 190) {
        doc.addPage();
        doc.y = 50;
      } else if (i > 0) {
        doc.moveDown(0.9);
        doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(0.6).strokeColor(LIGHT_RULE).stroke();
        doc.moveDown(0.7);
      }

      const titulo = `${i + 1}. Radicado ${r.numero_radicado}`;
      doc.font('Helvetica-Bold').fontSize(10.5).fillColor(NAVY).text(titulo, 50);
      doc.moveDown(0.35);

      const parteCliente = r.nombre_cliente
        ? `${r.nombre_cliente}${r.calidad_cliente ? ` (${r.calidad_cliente})` : ''}`
        : null;
      if (parteCliente || r.nombre_contraparte) {
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(GREY).text('Partes: ', 50, doc.y, { continued: true });
        doc.font('Helvetica').fontSize(8.5).fillColor('#222').text(
          `${parteCliente || '—'}${r.nombre_contraparte ? `  vs.  ${r.nombre_contraparte}` : ''}`
        );
      }

      const materia = [r.nombre_tipo_proceso, r.nombre_subtipo_proceso].filter(Boolean).join(' — ');
      field(doc, 'Materia', materia || null, 50);
      field(doc, 'Juzgado / autoridad', r.juzgado_o_autoridad_que_conoce, 50);
      field(doc, 'Sitio consultado', r.portal_consultado, 50);

      doc.moveDown(0.15);
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(GREY).text('Resultado: ', 50, doc.y, { continued: true });
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(NAVY).text(RESULTADO_LABEL[r.resultado] || r.resultado);

      if (r.observacion) field(doc, 'Observación', r.observacion, 50);

      doc.moveDown(0.15);
      doc.font('Helvetica-Oblique').fontSize(8).fillColor(GREY).text(
        `Revisado por ${r.nombre_usuario || '—'} · ${new Date(r.created_at).toLocaleString('es-CO')}`, 50
      );
    });

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      drawFooter(doc, i, range.count);
    }

    doc.end();
  } catch (err) { next(err); }
}

module.exports = {
  method: 'GET', path: '/pdf',
  middleware: [authenticate, requireRoles('admin', 'lawyer'), query('fecha').optional().isDate({ format: 'YYYY-MM-DD', strictMode: true }), validate],
  handler,
};
