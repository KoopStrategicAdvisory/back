const mongoose = require('mongoose');

const ConsultationLogSchema = new mongoose.Schema(
  {
    processNumber: {
      type: String,
      required: true,
      trim: true,
    },
    result: {
      type: String,
      required: true,
      enum: ['Sin movimiento', 'Actuación nueva', 'Término corriendo'],
    },
    observation: {
      type: String,
      trim: true,
      default: '',
    },
    createdBy: {
      id: {
        type: String,
        required: true,
      },
      name: {
        type: String,
        required: true,
        trim: true,
      },
      email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
      },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('ConsultationLog', ConsultationLogSchema);
