const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const dotenv = require('dotenv');
const path = require('path');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();

app.use(helmet());
app.use(
  cors({
    // Permitir todos los orígenes reflejando el origin de la solicitud
    origin: true,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());
app.use((req, _res, next) => {
  console.log("[APP]", req.method, req.originalUrl);
  next();
});

// Rutas de autenticación
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);
const kpisRoutes = require('./routes/kpis');
app.use('/api/kpis', kpisRoutes);
const adminRoutes = require('./routes/admin');
app.use('/api/admin', adminRoutes);

app.get('/api/ping', (req, res) => {
  res.status(200).json({ ok: true, pong: 'api' });
});

// Conectar a MongoDB antes de levantar el servidor
const PORT = process.env.PORT || 4000;
//const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/auth_mvp';
const MONGODB_URI = 'mongodb+srv://koop_userdb:Bopm5yln5vGvMLN8@cluster0.mc0qv4s.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

mongoose
  .connect(MONGODB_URI, { autoIndex: true })
  .then(() => {
    console.log('MongoDB ✓ conectado');
    app.listen(PORT, () => {
      console.log(`API listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('MongoDB ✗ error:', err.message);
    process.exit(1);
  });
