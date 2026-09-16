'use strict';
const axios = require('axios');

// API publica real detras del formulario de "Consulta de Procesos Nacional
// Unificada" de la Rama Judicial (https://consultaprocesos.ramajudicial.gov.co) —
// no requiere login ni captcha, a diferencia de Fiscalia, SIUGJ, etc. Se
// encontro inspeccionando las llamadas que hace el propio sitio al buscar
// por numero de radicacion.
const BASE = 'https://consultaprocesos.ramajudicial.gov.co:448/api/v2';
const TIMEOUT_MS = 15000;

function client() {
  return axios.create({
    baseURL: BASE,
    timeout: TIMEOUT_MS,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KoopStrategicAdvisory/1.0)' },
  });
}

// Busca un proceso por su numero de radicacion (23 digitos, el radicado
// publico unificado). SoloActivos=false trae el proceso aunque ya no tenga
// actuaciones en los ultimos 30 dias — no queremos perder de vista un caso
// solo porque lleva un tiempo quieto.
async function buscarPorRadicado(numeroRadicado) {
  const { data } = await client().get('/Procesos/Consulta/NumeroRadicacion', {
    params: { numero: numeroRadicado, SoloActivos: false, pagina: 1 },
  });
  return data?.procesos?.[0] ?? null;
}

// El endpoint de actuaciones ya devuelve la lista ordenada con la mas
// reciente primero (confirmado contra un radicado real). Se toma solo esa
// para comparar si hubo novedad desde la ultima verificacion.
async function ultimaActuacion(idProceso) {
  const { data } = await client().get(`/Proceso/Actuaciones/${idProceso}`);
  const actuaciones = Array.isArray(data?.actuaciones) ? data.actuaciones : [];
  return actuaciones[0] ?? null;
}

module.exports = { buscarPorRadicado, ultimaActuacion };
