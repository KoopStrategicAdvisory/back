'use strict';
const express      = require('express');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const helmet       = require('helmet');
const dotenv       = require('dotenv');
const path         = require('path');
const yaml         = require('js-yaml');
const fs           = require('fs');

dotenv.config({ path: path.join(__dirname, '../.env') });

const { getDb } = require('./db/client');

const app = express();

try {
  console.log('[ENV] AWS_REGION =', process.env.AWS_REGION || '(undefined)');
} catch (_) {}

// Helmet con CSP relajada solo para la ruta /api/docs
app.use((req, res, next) => {
  if (req.path.startsWith('/api/docs')) return next();
  helmet()(req, res, next);
});
app.use(helmet.hidePoweredBy());

// OpenAPI spec + Scalar API Reference (CDN, sin dependencias ESM)
const swaggerSpec = yaml.load(fs.readFileSync(path.join(__dirname, '../swagger.yaml'), 'utf8'));

app.get('/api/openapi.json', (req, res) => res.json(swaggerSpec));

app.get('/api/docs', (req, res) => {
  res.type('text/html').send(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Koop API Docs</title>
  <style>body { margin: 0; }</style>
</head>
<body>
  <script
    id="api-reference"
    data-url="/api/openapi.json"
    data-configuration='${JSON.stringify({
      theme: 'purple',
      layout: 'modern',
      defaultHttpClient: { targetKey: 'javascript', clientKey: 'fetch' },
      authentication: { preferredSecurityScheme: 'BearerAuth' },
    })}'
  ></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>`);
});

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// Request logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const routePath = req.route?.path;
    const pathLabel = routePath ? ((req.baseUrl || '') + routePath) : req.originalUrl;
    console.log('[ROUTE]', req.method, pathLabel, '->', res.statusCode, '(' + (Date.now() - start) + 'ms)');
  });
  next();
});

app.get('/api/ping', (req, res) => res.status(200).json({ ok: true, pong: 'api' }));

const PORT = process.env.PORT || 4000;

// Inicializar PGlite y luego montar features
getDb()
  .then(() => {
    console.log('[db] PGlite listo');

    app.use('/api/auth',           require('./features/auth'));
    app.use('/api/catalogos',      require('./features/catalogos'));
    app.use('/api/clientes',       require('./features/clientes'));
    app.use('/api/users',          require('./features/users'));
    app.use('/api/expedientes',    require('./features/expedientes'));
    app.use('/api/iter-procesal',  require('./features/iter-procesal'));
    app.use('/api/tareas',         require('./features/tareas'));
    app.use('/api/actuaciones',    require('./features/actuaciones'));
    app.use('/api/notificaciones', require('./features/notificaciones'));
    app.use('/api/audiencias',     require('./features/audiencias'));
    app.use('/api/documentos',     require('./features/documentos'));
    app.use('/api/financiero',     require('./features/financiero'));
    app.use('/api/kanban',         require('./features/kanban'));
    app.use('/api/colaboracion',   require('./features/colaboracion'));

    // Error handler global — DEBE ir después de todas las rutas
    app.use(require('./middleware/error-handler'));

    app.listen(PORT, () => {
      console.log(`API escuchando en http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[db] Error al inicializar PGlite:', err.message);
    process.exit(1);
  });
