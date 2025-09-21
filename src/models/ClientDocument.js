const mongoose = require('mongoose');

const clientDocumentSchema = new mongoose.Schema({
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true,
    index: true
  },
  documentNumber: {
    type: String,
    required: true,
    index: true
  },
  fileName: {
    type: String,
    required: true
  },
  originalName: {
    type: String,
    required: true
  },
  fileSize: {
    type: Number,
    required: true
  },
  mimeType: {
    type: String,
    required: true
  },
  s3Key: {
    type: String,
    required: true,
    unique: true
  },
  folder: {
    type: String,
    required: true
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  lastAccessed: {
    type: Date,
    default: Date.now
  },
  downloadCount: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Índices compuestos para consultas eficientes
clientDocumentSchema.index({ client: 1, uploadedAt: -1 });
clientDocumentSchema.index({ documentNumber: 1, uploadedAt: -1 });
clientDocumentSchema.index({ uploadedBy: 1, uploadedAt: -1 });
clientDocumentSchema.index({ folder: 1, uploadedAt: -1 });

module.exports = mongoose.model('ClientDocument', clientDocumentSchema);
