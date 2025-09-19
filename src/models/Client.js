const mongoose = require('mongoose');

const ClientSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    // Admin asignado responsable del cliente (opcional)
    assignedAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
      index: true,
    },
    // Datos solicitados
    fullName: { type: String, required: true, trim: true },
    documentType: { type: String, trim: true },
    documentNumber: { type: String, trim: true, index: true },
    birthDate: { type: Date },
    phone: { type: String, trim: true }, // fijo y/o celular
    email: { type: String, trim: true, lowercase: true },
    address: { type: String, trim: true },
    contactInfo: { type: String, trim: true }, // informacion de contacto adicional (opcional)
  },
  { timestamps: true }
);

module.exports = mongoose.model('Client', ClientSchema);
