'use strict';
const { radicadosPublicos, consultasExternas, users } = require('../repositories');
const ramaJudicial = require('./ramaJudicial');

// Tiene que calzar exactamente con el label que usa el frontend en
// constants/consultaPortals.js — es el mismo texto libre que se guarda en
// expediente_radicado_publico.organismo.
const ORGANISMO_RAMA_JUDICIAL = 'Consulta de procesos Rama Judicial';

// Cuenta de servicio creada por src/db/sistema-usuario.sql — dueña de los
// registros que este verificador genera solo, para que en la bitácora quede
// claro cuáles revisiones hizo un abogado y cuáles el sistema.
const SISTEMA_EMAIL = 'sistema.rama-judicial@koop.internal';
let _sistemaUserId = null;
async function sistemaUserId() {
  if (_sistemaUserId) return _sistemaUserId;
  const user = await users.findByEmail(SISTEMA_EMAIL);
  if (!user) throw new Error(`No existe la cuenta de servicio ${SISTEMA_EMAIL} — revisa que sistema-usuario.sql se haya ejecutado.`);
  _sistemaUserId = user.id;
  return _sistemaUserId;
}

function toDateStr(d) {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

// Arma la observación con exactamente los 3 datos que pidió Felipe: fecha de
// actuación, actuación y anotación, tal como los devuelve la Rama Judicial.
function observacionDe(actuacion, fechaNueva) {
  const partes = [];
  if (fechaNueva) partes.push(`Fecha de actuación: ${fechaNueva}`);
  if (actuacion?.actuacion) partes.push(`Actuación: ${actuacion.actuacion}`);
  if (actuacion?.anotacion) partes.push(`Anotación: ${actuacion.anotacion}`);
  const detalle = partes.length ? partes.join(' — ') : 'sin actuaciones registradas en el portal.';
  return `Generado automáticamente (Rama Judicial) — ${detalle}`;
}

// Revisa cada radicado publico activo registrado bajo "Consulta de procesos
// Rama Judicial" contra la API real del portal (sin captcha), actualiza el
// cache de ultima actuacion conocida, y genera él mismo el registro del día
// (fecha de actuación, actuación y anotación) a nombre de la cuenta de
// servicio. Solo genera un registro nuevo si hoy todavía no tiene uno, o si
// apareció una actuación realmente distinta a la que ya se conocía — así una
// segunda pasada sin cambios en el mismo día no duplica filas.
async function verificarTodos() {
  const radicados = await radicadosPublicos.findActivosPorOrganismo(ORGANISMO_RAMA_JUDICIAL);
  const resultado = { total: radicados.length, revisados: 0, novedades: 0, registrados: 0, errores: [] };
  const userId = await sistemaUserId();

  for (const r of radicados) {
    try {
      let idProceso = r.id_proceso_rama ? Number(r.id_proceso_rama) : null;
      let actuacion = null;
      if (!idProceso) {
        const proceso = await ramaJudicial.buscarPorRadicado(r.numero_radicado);
        if (!proceso) {
          resultado.errores.push({ id: r.id, numero_radicado: r.numero_radicado, message: 'No encontrado en Rama Judicial' });
          continue;
        }
        idProceso = proceso.idProceso;
      }

      actuacion = await ramaJudicial.ultimaActuacion(idProceso);
      resultado.revisados++;

      const fechaNueva = toDateStr(actuacion?.fechaActuacion);
      const fechaConocida = toDateStr(r.ultima_fecha_actuacion_conocida);
      const textoNuevo = actuacion ? [actuacion.actuacion, actuacion.anotacion].filter(Boolean).join(' — ') : null;
      const huboNovedad = !!fechaNueva && fechaNueva !== fechaConocida;

      await radicadosPublicos.actualizarSeguimientoRama(r.id, {
        id_proceso_rama: idProceso,
        ultima_fecha_actuacion_conocida: fechaNueva,
        ultima_actuacion_texto: textoNuevo,
      });

      if (huboNovedad) resultado.novedades++;

      if (!r.ultima_consulta_hoy_id || huboNovedad) {
        await consultasExternas.create({
          id_radicado_publico: r.id,
          resultado: huboNovedad ? 'actuacion_nueva' : 'sin_movimiento',
          observacion: observacionDe(actuacion, fechaNueva),
        }, userId);
        resultado.registrados++;
      }
    } catch (e) {
      resultado.errores.push({ id: r.id, numero_radicado: r.numero_radicado, message: e.message });
    }
  }

  return resultado;
}

module.exports = { verificarTodos, ORGANISMO_RAMA_JUDICIAL };
