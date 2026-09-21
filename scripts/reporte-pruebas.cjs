'use strict';
// Corre TODAS las pruebas de KOOP y arma UN solo reporte:
//   1. Backend · unitarias            (jest)
//   2. Backend · funcionales e integración (jest + PGlite)
//   3. Navegador · E2E                (Playwright, en el repo del front)
//   4. (opcional) Manual de usuario   (--con-manual: regenera capturas y PDF)
//
// Uso:
//   npm run verificar                 -> todo (necesita Docker abierto para el E2E)
//   npm run verificar -- --sin-e2e    -> solo backend
//   npm run verificar -- --con-manual -> además regenera el manual de usuario
//
// Salida: reports/reporte-de-pruebas.html (+ .md y .json) y código de salida
//   0 = todo en verde · 1 = hay pruebas que fallan · 2 = una capa no pudo correr.
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const { spawnSync } = require('child_process');

const BACK = path.resolve(__dirname, '..');
const FRONT_APP = process.env.KOOP_FRONT_DIR || path.resolve(BACK, '../v2/front/apps/koop');
const FRONT_REPO = path.resolve(FRONT_APP, '../..');
const args = new Set(process.argv.slice(2));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'koop-pruebas-'));
const OUT = path.join(BACK, 'reports');
fs.mkdirSync(OUT, { recursive: true });

const ahora = () => Date.now();
const run = (cmd, argv, cwd, env = {}) =>
  spawnSync(cmd, argv, { cwd, env: { ...process.env, ...env }, stdio: 'inherit', shell: true });
const git = (cwd, ...a) => spawnSync('git', a, { cwd, encoding: 'utf8' }).stdout?.trim() || '';
const leerJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const limpiar = (s) => String(s ?? '').replace(/\[[0-9;]*m/g, '');

function postgresArriba() {
  return new Promise((resolve) => {
    const s = net.connect({ host: process.env.PGHOST || '127.0.0.1', port: Number(process.env.PGPORT || 5432) });
    s.setTimeout(2000);
    s.on('connect', () => { s.destroy(); resolve(true); });
    s.on('error', () => resolve(false));
    s.on('timeout', () => { s.destroy(); resolve(false); });
  });
}

// ── Lectores de resultados ───────────────────────────────────────────────────
function leerJest(archivo) {
  const j = leerJson(archivo);
  if (!j) return null;
  const pruebas = [];
  for (const f of j.testResults) {
    const archivoRel = path.relative(BACK, f.name).replace(/\\/g, '/');
    if (!f.assertionResults.length && f.status === 'failed') {
      pruebas.push({ archivo: archivoRel, nombre: '(la suite no pudo arrancar)', estado: 'fallo', ms: 0, error: limpiar(f.message) });
    }
    for (const a of f.assertionResults) {
      pruebas.push({
        archivo: archivoRel, nombre: a.fullName, ms: a.duration || 0,
        estado: a.status === 'passed' ? 'ok' : a.status === 'failed' ? 'fallo' : 'omitida',
        error: limpiar((a.failureMessages || []).join('\n')),
      });
    }
  }
  return pruebas;
}

function leerPlaywright(archivo) {
  const j = leerJson(archivo);
  if (!j) return null;
  const pruebas = [];
  const recorrer = (suite, ruta) => {
    const r = suite.title && !suite.file ? [...ruta, suite.title] : ruta;
    for (const s of suite.specs || []) {
      const t = s.tests?.[0];
      const res = t?.results?.[t.results.length - 1];
      const estado = t?.status === 'expected' ? 'ok' : t?.status === 'skipped' ? 'omitida' : 'fallo';
      pruebas.push({
        archivo: path.join('apps/koop', s.file).replace(/\\/g, '/'), nombre: [...r, s.title].join(' › '),
        estado, ms: res?.duration || 0, error: limpiar(res?.error?.message || ''),
      });
    }
    for (const sub of suite.suites || []) recorrer(sub, r);
  };
  for (const s of j.suites || []) recorrer(s, []);
  return pruebas;
}

// ── Ejecución de cada capa ───────────────────────────────────────────────────
async function main() {
  const capas = [];
  const t0 = ahora();

  const capaJest = (titulo, argv, archivo) => {
    console.log(`\n══════ ${titulo} ══════`);
    const ini = ahora();
    run('node', argv.concat(['--json', `--outputFile=${archivo}`]), BACK);
    const pruebas = leerJest(archivo);
    capas.push({ titulo, pruebas, ms: ahora() - ini, motivo: pruebas ? null : 'no se pudo leer el resultado' });
  };

  capaJest('Backend · unitarias', ['node_modules/jest/bin/jest.js', '--silent'], path.join(TMP, 'unit.json'));
  capaJest('Backend · funcionales e integración',
    ['--experimental-vm-modules', 'node_modules/jest/bin/jest.js', '--config', 'jest.functional.config.js', '--runInBand', '--forceExit', '--silent'],
    path.join(TMP, 'func.json'));

  if (!args.has('--sin-e2e')) {
    const titulo = 'Navegador · E2E (Playwright)';
    console.log(`\n══════ ${titulo} ══════`);
    if (!fs.existsSync(FRONT_APP)) {
      capas.push({ titulo, pruebas: null, ms: 0, motivo: `no encuentro el front en ${FRONT_APP} (usa KOOP_FRONT_DIR)` });
    } else if (!(await postgresArriba())) {
      capas.push({ titulo, pruebas: null, ms: 0, motivo: 'Postgres no responde: abre Docker Desktop (contenedor postgres-db) y repite' });
    } else {
      const ini = ahora();
      const archivo = path.join(TMP, 'e2e.json');
      run('pnpm', ['exec', 'playwright', 'test', '--reporter=json'], FRONT_APP, { PLAYWRIGHT_JSON_OUTPUT_NAME: archivo });
      const pruebas = leerPlaywright(archivo);
      capas.push({ titulo, pruebas, ms: ahora() - ini, motivo: pruebas ? null : 'Playwright no produjo resultados' });
    }
  }

  let manual = null;
  if (args.has('--con-manual')) {
    console.log('\n══════ Manual de usuario ══════');
    const ini = ahora();
    const r = run('pnpm', ['manual'], FRONT_APP);
    manual = { ok: r.status === 0, ms: ahora() - ini };
  }

  // ¿El manual quedó atrás respecto a la interfaz?
  const avisos = [];
  const md = 'apps/koop/docs/manual/manual-de-usuario.md';
  if (fs.existsSync(path.join(FRONT_REPO, md))) {
    const tManual = Number(git(FRONT_REPO, 'log', '-1', '--format=%ct', '--', md)) || 0;
    const tUi = Number(git(FRONT_REPO, 'log', '-1', '--format=%ct', '--', 'apps/koop/src')) || 0;
    const sinCommit = git(FRONT_REPO, 'status', '--porcelain', '--', 'apps/koop/src');
    const manualTocado = git(FRONT_REPO, 'status', '--porcelain', '--', md);
    if ((tUi > tManual || sinCommit) && !manualTocado && !manual?.ok) {
      avisos.push('La interfaz cambió después de la última actualización del manual de usuario. Si el cambio se ve o se usa distinto, actualiza docs/manual/manual-de-usuario.md y corre "pnpm manual" en el front.');
    }
  }

  const todas = capas.flatMap((c) => c.pruebas || []);
  const fallos = todas.filter((p) => p.estado === 'fallo').length;
  const sinCorrer = capas.filter((c) => !c.pruebas).length;
  const veredicto = fallos ? 'CON FALLOS' : sinCorrer || (manual && !manual.ok) ? 'INCOMPLETO' : 'TODO EN VERDE';
  const info = {
    fecha: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }),
    back: `${git(BACK, 'rev-parse', '--short', 'HEAD')} (${git(BACK, 'rev-parse', '--abbrev-ref', 'HEAD')})${git(BACK, 'status', '--porcelain') ? ' + cambios sin commit' : ''}`,
    front: `${git(FRONT_REPO, 'rev-parse', '--short', 'HEAD')} (${git(FRONT_REPO, 'rev-parse', '--abbrev-ref', 'HEAD')})${git(FRONT_REPO, 'status', '--porcelain', '--', 'apps') ? ' + cambios sin commit' : ''}`,
    node: process.version, duracionMs: ahora() - t0,
  };

  escribirReportes({ capas, manual, avisos, veredicto, info });
  console.log(`\n${veredicto} · ${todas.filter((p) => p.estado === 'ok').length}/${todas.length} pruebas ok, ${fallos} fallan`);
  console.log(`Reporte: ${path.join(OUT, 'reporte-de-pruebas.html')}`);
  avisos.forEach((a) => console.log(`AVISO: ${a}`));
  process.exit(fallos ? 1 : sinCorrer || (manual && !manual.ok) ? 2 : 0);
}

// ── Reportes ─────────────────────────────────────────────────────────────────
const seg = (ms) => (ms / 1000).toFixed(1) + ' s';
function resumen(c) {
  const p = c.pruebas || [];
  return { total: p.length, ok: p.filter((x) => x.estado === 'ok').length, fallo: p.filter((x) => x.estado === 'fallo').length, omitida: p.filter((x) => x.estado === 'omitida').length };
}

function escribirReportes({ capas, manual, avisos, veredicto, info }) {
  const verde = veredicto === 'TODO EN VERDE';
  const color = verde ? '#15803d' : veredicto === 'INCOMPLETO' ? '#b45309' : '#b91c1c';

  // Markdown corto, pensado para pegar en un commit, un PR o un mensaje.
  const md = [
    `# Reporte de pruebas — ${veredicto}`, '',
    `${info.fecha} · back \`${info.back}\` · front \`${info.front}\` · ${seg(info.duracionMs)}`, '',
    '| Capa | Resultado | Pruebas | Duración |', '|---|---|---|---|',
    ...capas.map((c) => {
      if (!c.pruebas) return `| ${c.titulo} | no se ejecutó | — | — |`;
      const r = resumen(c);
      return `| ${c.titulo} | ${r.fallo ? 'FALLA' : 'ok'} | ${r.ok}/${r.total}${r.fallo ? ` (${r.fallo} fallan)` : ''} | ${seg(c.ms)} |`;
    }),
    ...(manual ? [`| Manual de usuario | ${manual.ok ? 'regenerado' : 'FALLÓ'} | — | ${seg(manual.ms)} |`] : []),
    ...capas.filter((c) => !c.pruebas).map((c) => `\n**${c.titulo}:** ${c.motivo}`),
    ...avisos.map((a) => `\n> AVISO: ${a}`),
  ].join('\n');
  fs.writeFileSync(path.join(OUT, 'reporte-de-pruebas.md'), md + '\n');
  fs.writeFileSync(path.join(OUT, 'reporte-de-pruebas.json'), JSON.stringify({ veredicto, info, capas, manual, avisos }, null, 2));

  const tarjetas = capas.map((c) => {
    if (!c.pruebas) return `<div class="card warn"><h3>${esc(c.titulo)}</h3><p class="big">No se ejecutó</p><p>${esc(c.motivo)}</p></div>`;
    const r = resumen(c);
    return `<div class="card ${r.fallo ? 'bad' : 'good'}"><h3>${esc(c.titulo)}</h3><p class="big">${r.ok}/${r.total}</p><p>${r.fallo ? `${r.fallo} fallan` : 'todas pasan'} · ${seg(c.ms)}</p></div>`;
  }).join('');

  const detalle = capas.filter((c) => c.pruebas).map((c) => {
    const porArchivo = new Map();
    for (const p of c.pruebas) porArchivo.set(p.archivo, [...(porArchivo.get(p.archivo) || []), p]);
    const filas = [...porArchivo].map(([archivo, ps]) => {
      const malas = ps.filter((p) => p.estado === 'fallo').length;
      return `<details ${malas ? 'open' : ''}><summary class="${malas ? 'bad' : ''}">${esc(archivo)} <span>${ps.length - malas}/${ps.length}</span></summary><table>${ps.map((p) =>
        `<tr class="${p.estado}"><td class="est">${p.estado === 'ok' ? '✔' : p.estado === 'fallo' ? '✘' : '–'}</td><td>${esc(p.nombre)}${p.error ? `<pre>${esc(p.error.slice(0, 1500))}</pre>` : ''}</td><td class="t">${p.ms ? Math.round(p.ms) + ' ms' : ''}</td></tr>`).join('')}</table></details>`;
    }).join('');
    return `<h2>${esc(c.titulo)}</h2>${filas}`;
  }).join('');

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reporte de pruebas — KOOP</title><style>
  body{font:15px/1.5 'Segoe UI',system-ui,sans-serif;margin:0;background:#f1f5f9;color:#0f172a}
  main{max-width:1000px;margin:0 auto;padding:28px 20px 60px}
  h1{margin:0 0 4px} .meta{color:#64748b;margin-bottom:18px}
  .veredicto{display:inline-block;padding:8px 18px;border-radius:999px;color:#fff;font-weight:700;background:${color};margin-bottom:18px}
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-bottom:26px}
  .card{background:#fff;border-radius:12px;padding:14px 18px;border-top:5px solid #94a3b8;box-shadow:0 1px 4px rgba(15,23,42,.12)}
  .card.good{border-color:#15803d}.card.bad{border-color:#b91c1c}.card.warn{border-color:#b45309}
  .card h3{margin:0 0 4px;font-size:14px;color:#475569}.big{font-size:30px;font-weight:700;margin:0}
  h2{margin:28px 0 8px} details{background:#fff;border-radius:8px;margin:6px 0;box-shadow:0 1px 3px rgba(15,23,42,.1)}
  summary{cursor:pointer;padding:9px 14px;font-weight:600}summary span{float:right;color:#64748b;font-weight:400}summary.bad{color:#b91c1c}
  table{width:100%;border-collapse:collapse}td{padding:5px 14px;border-top:1px solid #e2e8f0;vertical-align:top}
  td.est{width:22px;font-weight:700}tr.ok .est{color:#15803d}tr.fallo .est{color:#b91c1c}td.t{width:80px;color:#94a3b8;text-align:right;white-space:nowrap}
  pre{background:#fef2f2;color:#7f1d1d;padding:8px;border-radius:6px;white-space:pre-wrap;font-size:12px}
  .aviso{background:#fffbeb;border-left:5px solid #d97706;padding:10px 14px;margin:12px 0;border-radius:0 8px 8px 0}
  </style></head><body><main>
  <h1>Reporte de pruebas</h1>
  <p class="meta">${esc(info.fecha)} · back <code>${esc(info.back)}</code> · front <code>${esc(info.front)}</code> · Node ${esc(info.node)} · ${seg(info.duracionMs)}</p>
  <div class="veredicto">${veredicto}</div>
  <div class="cards">${tarjetas}${manual ? `<div class="card ${manual.ok ? 'good' : 'bad'}"><h3>Manual de usuario</h3><p class="big">${manual.ok ? 'Regenerado' : 'Falló'}</p><p>${seg(manual.ms)}</p></div>` : ''}</div>
  ${avisos.map((a) => `<div class="aviso">${esc(a)}</div>`).join('')}
  ${detalle}
  </main></body></html>`;
  fs.writeFileSync(path.join(OUT, 'reporte-de-pruebas.html'), html);
}

main().catch((e) => { console.error(e); process.exit(2); });
