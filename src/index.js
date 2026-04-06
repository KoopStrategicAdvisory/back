const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const dotenv = require('dotenv');
const path = require('path');
const mongoose = require('mongoose');

const {
  refreshAllowedRolesFromDb,
  ensureDefaultRoles,
  getAllowedRoles,
} = require('./utils/roles');

dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();

// Quick visibility: confirm AWS region is loaded from env
try {
  console.log('[ENV] AWS_REGION =', process.env.AWS_REGION || '(undefined)');
} catch (_) {}

app.use(helmet());
app.use(
  cors({
    // Permitir todos los ori­genes reflejando el origin de la solicitud
    origin: true,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const routePath = req.route?.path;
    const pathLabel = routePath ? ((req.baseUrl || '') + routePath) : req.originalUrl;
    console.log('[ROUTE]', req.method, pathLabel, '->', res.statusCode, '(' + (Date.now() - start) + 'ms)');
  });
  next();
});

// Rutas de autenticacion
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);
const kpisRoutes = require('./routes/kpis');
app.use('/api/kpis', kpisRoutes);
const adminRoutes = require('./routes/admin');
app.use('/api/admin', adminRoutes);
const docsRoutes = require('./routes/docs');
app.use('/api/docs', docsRoutes);
const aiRoutes = require('./routes/ai');
app.use('/api/ai', aiRoutes);
const spotifyRoutes = require('./routes/spotify');
app.use('/api/spotify', spotifyRoutes);

app.get('/api/ping', (req, res) => {
  res.status(200).json({ ok: true, pong: 'api' });
});

// Conectar a MongoDB antes de levantar el servidor
const PORT = process.env.PORT || 4000;
const baseUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const databaseName = process.env.DATABASE_NAME || 'koop';
const MONGODB_URI = baseUri.includes('?') ? baseUri.replace('/?', `/${databaseName}?`) : `${baseUri}/${databaseName}`;

mongoose
  .connect(MONGODB_URI, { autoIndex: true })
  .then(async () => {
    console.log('MongoDB connected to ' + MONGODB_URI);

    const defaultRoles = [
      { name: 'admin', displayName: 'Administrador', system: true, priority: 0 },
      { name: 'lawyer', displayName: 'Abogado', system: false, priority: 1 },
      { name: 'client', displayName: 'Cliente', system: false, priority: 2 },
      { name: 'user', displayName: 'Usuario', system: false, priority: 3 },
    ];

    await ensureDefaultRoles(defaultRoles);
    await refreshAllowedRolesFromDb();
    console.log('[roles] Activos:', getAllowedRoles().join(', ') || '(ninguno)');

    app.listen(PORT, () => {
      console.log(`API listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });



