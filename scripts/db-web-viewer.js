'use strict';
// Visor web de solo-lectura para inspeccionar la base PGlite mientras
// `npm run db:server` expone la base como un Postgres normal en localhost.
// Uso: npm run db:server   (en una terminal)
//      npm run db:web      (en otra terminal, luego abrir http://localhost:5434)
const express = require('express');
const { Client } = require('pg');

const PG_HOST = process.env.DB_VIEWER_PG_HOST || '127.0.0.1';
const PG_PORT = Number(process.env.DB_VIEWER_PG_PORT || 5433);
const WEB_PORT = Number(process.env.DB_VIEWER_WEB_PORT || 5434);

async function withClient(fn) {
  const client = new Client({
    host: PG_HOST,
    port: PG_PORT,
    database: 'postgres',
    user: 'postgres',
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

function escapeHtml(value) {
  if (value === null || value === undefined) return '<i>null</i>';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderPage(body) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Koop · Visor PGlite</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem; background: #0b0e14; color: #e6e6e6; }
  a { color: #6cb6ff; }
  table { border-collapse: collapse; width: 100%; margin-top: 1rem; font-size: 0.85rem; }
  th, td { border: 1px solid #2a2f3a; padding: 6px 10px; text-align: left; }
  th { background: #161b22; }
  tr:nth-child(even) { background: #11151c; }
  textarea { width: 100%; height: 100px; background: #11151c; color: #e6e6e6; border: 1px solid #2a2f3a; padding: 8px; font-family: monospace; }
  button { margin-top: 8px; padding: 6px 16px; cursor: pointer; }
  .error { color: #ff6b6b; white-space: pre-wrap; }
  nav { margin-bottom: 1.5rem; }
</style>
</head>
<body>
<nav><a href="/">&larr; Tablas</a></nav>
${body}
</body>
</html>`;
}

const app = express();
app.use(express.urlencoded({ extended: false }));

app.get('/', async (req, res) => {
  try {
    const tables = await withClient((c) =>
      c.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' ORDER BY table_name`
      )
    );
    const list = tables.rows
      .map((t) => `<li><a href="/table/${encodeURIComponent(t.table_name)}">${escapeHtml(t.table_name)}</a></li>`)
      .join('\n');
    res.send(
      renderPage(`
        <h1>Tablas en PGlite</h1>
        <ul>${list || '<li><i>No hay tablas públicas todavía</i></li>'}</ul>
        <h2>Consulta SQL</h2>
        <form method="post" action="/query">
          <textarea name="sql" placeholder="SELECT * FROM users LIMIT 50;"></textarea>
          <br><button type="submit">Ejecutar</button>
        </form>
      `)
    );
  } catch (err) {
    res.status(500).send(renderPage(`<p class="error">No se pudo conectar a localhost:${PG_PORT}.\n¿Está corriendo "npm run db:server"?\n\n${escapeHtml(err.message)}</p>`));
  }
});

app.get('/table/:name', async (req, res) => {
  const { name } = req.params;
  try {
    const result = await withClient((c) => c.query(`SELECT * FROM "${name.replace(/"/g, '')}" LIMIT 200`));
    res.send(renderPage(renderResult(name, result)));
  } catch (err) {
    res.status(500).send(renderPage(`<p class="error">${escapeHtml(err.message)}</p>`));
  }
});

app.post('/query', async (req, res) => {
  const sql = req.body.sql || '';
  try {
    const result = await withClient((c) => c.query(sql));
    res.send(renderPage(renderResult('Resultado', result)));
  } catch (err) {
    res.status(500).send(renderPage(`<p class="error">${escapeHtml(err.message)}</p>`));
  }
});

function renderResult(title, result) {
  const cols = result.fields.map((f) => f.name);
  const head = cols.map((c) => `<th>${escapeHtml(c)}</th>`).join('');
  const rows = result.rows
    .map((row) => `<tr>${cols.map((c) => `<td>${escapeHtml(row[c])}</td>`).join('')}</tr>`)
    .join('\n');
  return `<h1>${escapeHtml(title)}</h1>
  <p>${result.rows.length} fila(s)</p>
  <table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

app.listen(WEB_PORT, () => {
  console.log(`[db-web-viewer] http://localhost:${WEB_PORT}  (leyendo Postgres en ${PG_HOST}:${PG_PORT})`);
});
