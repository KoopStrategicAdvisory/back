const mongoose = require('mongoose');

const TaskSchema = new mongoose.Schema(
  {
    // Información básica de la tarea
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    
    // Estado y prioridad
    status: {
      type: String,
      enum: ['pendiente', 'en-curso', 'completada', 'cancelada'],
      default: 'pendiente',
    },
    priority: {
      type: String,
      enum: ['baja', 'media', 'alta', 'urgente'],
      default: 'media',
    },
    
    // Fechas importantes
    dueDate: {
      type: Date,
      required: true,
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    completedDate: {
      type: Date,
    },
    
    // Asignación y responsabilidades
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    
    // Relación con cliente y caso
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
    },
    clientName: {
      type: String,
      trim: true,
    },
    radicado: {
      type: String,
      trim: true,
    },
    
    // Categorización
    tags: [{
      type: String,
      trim: true,
    }],
    category: {
      type: String,
      enum: ['laboral', 'civil', 'penal', 'administrativo', 'tributario', 'comercial', 'familia', 'otro'],
      default: 'otro',
    },
    
    // Alertas y notificaciones
    alerts: [{
      type: {
        type: String,
        enum: ['vencimiento', 'recordatorio', 'urgente'],
      },
      date: Date,
      sent: {
        type: Boolean,
        default: false,
      },
      message: String,
    }],
    
    // Actividad y comentarios
    comments: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      text: String,
      date: {
        type: Date,
        default: Date.now,
      },
    }],
    
    // Archivos adjuntos
    attachments: [{
      name: String,
      url: String,
      size: Number,
      uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      uploadedAt: {
        type: Date,
        default: Date.now,
      },
    }],
    
    // Integración con calendario
    calendarEventId: String,
    reminderSent: {
      type: Boolean,
      default: false,
    },
    
    // Tiempo estimado y real
    estimatedHours: {
      type: Number,
      min: 0,
    },
    actualHours: {
      type: Number,
      min: 0,
    },
    
    // Control de versiones y estado
    isActive: {
      type: Boolean,
      default: true,
    },
    version: {
      type: Number,
      default: 1,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Índices para optimizar consultas
TaskSchema.index({ assignedTo: 1, status: 1 });
TaskSchema.index({ dueDate: 1, status: 1 });
TaskSchema.index({ client: 1 });
TaskSchema.index({ createdBy: 1 });
TaskSchema.index({ tags: 1 });
TaskSchema.index({ priority: 1, dueDate: 1 });

// Virtual para verificar si está vencida
TaskSchema.virtual('isOverdue').get(function() {
  return this.status !== 'completada' && this.dueDate < new Date();
});

// Virtual para días restantes
TaskSchema.virtual('daysRemaining').get(function() {
  if (this.status === 'completada') return 0;
  const now = new Date();
  const due = new Date(this.dueDate);
  const diffTime = due - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Middleware para actualizar fecha de completado
TaskSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    if (this.status === 'completada' && !this.completedDate) {
      this.completedDate = new Date();
    } else if (this.status !== 'completada') {
      this.completedDate = undefined;
    }
  }
  next();
});

// Método para agregar comentario
TaskSchema.methods.addComment = function(userId, text) {
  this.comments.push({
    user: userId,
    text: text,
    date: new Date()
  });
  return this.save();
};

// Método para crear alerta
TaskSchema.methods.addAlert = function(type, date, message) {
  this.alerts.push({
    type: type,
    date: date,
    message: message,
    sent: false
  });
  return this.save();
};

// Método estático para buscar tareas próximas a vencer
TaskSchema.statics.findUpcoming = function(days = 3) {
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + days);
  
  return this.find({
    dueDate: { $lte: endDate },
    status: { $in: ['pendiente', 'en-curso'] },
    isActive: true
  }).populate('assignedTo createdBy client');
};

// Método estático para buscar tareas vencidas
TaskSchema.statics.findOverdue = function() {
  return this.find({
    dueDate: { $lt: new Date() },
    status: { $in: ['pendiente', 'en-curso'] },
    isActive: true
  }).populate('assignedTo createdBy client');
};

module.exports = mongoose.model('Task', TaskSchema);


