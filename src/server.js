require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');

const app = express();

// CORS setup
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
/*app.use(
  cors({
    // Permitir todos los orígenes reflejando el origin de la solicitud
    origin: true,
    credentials: true,
  })
);*/
app.use(
  cors({
    origin: true,
    methods: ["POST"],
    allowedHeaders: ["Content-Type"],
    preflightContinue: true
  })
)
.options("*", function(req, res) {
  if (res.get("Access-Control-Allow-Origin"))
    res.set("Access-Control-Allow-Private-Network", "true");
  res.end();
});

app.use(express.json());
app.use(cookieParser());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Auth routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

// Start server after DB connection
const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://koop_userdb:Bopm5yln5vGvMLN8@cluster0.mc0qv4s.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('MongoDB conectado');
    app.listen(PORT, () => {
      console.log(`Servidor escuchando en puerto ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Error conectando a MongoDB:', err.message);
    process.exit(1);
  });
