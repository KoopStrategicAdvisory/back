require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const kpisRoutes = require('./routes/kpis');
const docsRoutes = require('./routes/docs');

const app = express();

// CORS setup
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
app.use(
  cors({
    // Permitir todos los orígenes reflejando el origin de la solicitud
    origin: true,
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Auth routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/kpis', kpisRoutes);
app.use('/api/docs', docsRoutes);

// Start server after DB connection
const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/koop';
console.log('Hola mundo');

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('MongoDB conectado a' + MONGODB_URI);
    app.listen(PORT, () => {
      console.log(`Servidor escuchando en puerto ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Error conectando a MongoDB:', err.message);
    process.exit(1);
  });
