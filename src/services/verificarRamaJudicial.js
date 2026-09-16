'use strict';
const { radicadosPublicos } = require('../repositories');
const ramaJudicial = require('./ramaJudicial');

// Tiene que calzar exactamente con el label que usa el frontend en
// constants/consultaPortals.js — es el mismo texto libre que se guarda en
// expediente_radicado_publico.organismo.
const ORGANISMO_RAMA_JUDICIAL = 'Consulta de procesos Rama Judicial';

function toDateStr(d) {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

// Revisa cada radicado publico activo registrado bajo "Consulta de procesos
// Rama Judicial" contra la API real del portal (sin captcha) y actualiza el
// cache de ultima actuacion conocida. No crea filas de consulta_externa_diaria
// (esas requieren un usuario real que las revise) — solo deja el dato listo
// para que el checklist lo muestre y el abogado lo confirme con un clic.
async function verificarTodos() {
  const radicados = await radicadosPublicos.findActivosPorOrganismo(ORGANISMO_RAMA_JUDICIAL);
  const resultado = { total: radicados.length, revisados: 0, novedades: 0, errores: [] };

  for (const r of radicados) {
    try {
      let idProceso = r.id_proceso_rama ? Number(r.id_proceso_rama) : null;
      if (!idProceso) {
        const proceso = await ramaJudicial.buscarPorRadicado(r.numero_radicado);
        if (!proceso) {
          resultado.errores.push({ id: r.id, numero_radicado: r.numero_radicado, message: 'No encontrado en Rama Judicial' });
          continue;
        }
        idProceso = proceso.idProceso;
      }

      const actuacion = await ramaJudicial.ultimaActuacion(idProceso);
      resultado.revisados++;
      if (!actuacion) continue;

      const fechaNueva = toDateStr(actuacion.fechaActuacion);
      const fechaConocida = toDateStr(r.ultima_fecha_actuacion_conocida);
      const textoNuevo = [actuacion.actuacion, actuacion.anotacion].filter(Boolean).join(' — ');
      const huboNovedad = fechaNueva && fechaNueva !== fechaConocida;

      await radicadosPublicos.actualizarSeguimientoRama(r.id, {
        id_proceso_rama: idProceso,
        ultima_fecha_actuacion_conocida: fechaNueva,
        ultima_actuacion_texto: textoNuevo,
      });

      if (huboNovedad) resultado.novedades++;
    } catch (e) {
      resultado.errores.push({ id: r.id, numero_radicado: r.numero_radicado, message: e.message });
    }
  }

  return resultado;
}

module.exports = { verificarTodos, ORGANISMO_RAMA_JUDICIAL };
