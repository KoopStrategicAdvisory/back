const express = require('express');
const jwt = require('jsonwebtoken');
const Task = require('../models/Task');
const User = require('../models/User');
const Client = require('../models/Client');
const { normalizeRoles } = require('../utils/roles');

const router = express.Router();

// Middleware de autenticación
function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token' });
  }
  try {
    const token = auth.slice(7);
    const payload = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ message: 'Token inválido o expirado' });
  }
}

// Middleware para verificar si es admin
function requireAdmin(req, res, next) {
  const roles = normalizeRoles(req.user?.roles);
  if (!roles.includes('admin')) {
    return res.status(403).json({ message: 'Se requiere rol admin' });
  }
  next();
}

// GET /tasks - Listar tareas
router.get('/', requireAuth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      priority,
      assignedTo,
      client,
      search,
      mine,
      overdue,
      upcoming
    } = req.query;

    const userId = req.user.sub || req.user.id;
    const roles = normalizeRoles(req.user?.roles);
    const isAdmin = roles.includes('admin');

    // Construir filtro base
    let filter = { isActive: true };

    // Si no es admin, solo puede ver sus tareas asignadas
    if (!isAdmin || mine === 'true') {
      filter.assignedTo = userId;
    }

    // Filtros opcionales
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (assignedTo && isAdmin) filter.assignedTo = assignedTo;
    if (client) filter.client = client;

    // Filtros especiales
    if (overdue === 'true') {
      filter.dueDate = { $lt: new Date() };
      filter.status = { $in: ['pendiente', 'en-curso'] };
    }

    if (upcoming === 'true') {
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 7); // Próximos 7 días
      filter.dueDate = { $lte: endDate, $gte: new Date() };
      filter.status = { $in: ['pendiente', 'en-curso'] };
    }

    // Búsqueda por texto
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      filter.$or = [
        { title: searchRegex },
        { description: searchRegex },
        { clientName: searchRegex },
        { radicado: searchRegex },
        { tags: { $in: [searchRegex] } }
      ];
    }

    // Ejecutar consulta con paginación
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const tasks = await Task.find(filter)
      .populate('assignedTo', 'name email')
      .populate('createdBy', 'name email')
      .populate('client', 'fullName documentNumber')
      .sort({ priority: -1, dueDate: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Contar total para paginación
    const total = await Task.countDocuments(filter);

    // Estadísticas adicionales para admins
    let stats = null;
    if (isAdmin) {
      const [
        totalTasks,
        pendingTasks,
        overdueTasks,
        completedThisWeek
      ] = await Promise.all([
        Task.countDocuments({ isActive: true }),
        Task.countDocuments({ status: 'pendiente', isActive: true }),
        Task.countDocuments({
          dueDate: { $lt: new Date() },
          status: { $in: ['pendiente', 'en-curso'] },
          isActive: true
        }),
        Task.countDocuments({
          status: 'completada',
          completedDate: {
            $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          },
          isActive: true
        })
      ]);

      stats = {
        total: totalTasks,
        pending: pendingTasks,
        overdue: overdueTasks,
        completedThisWeek
      };
    }

    res.json({
      tasks,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      },
      stats
    });
  } catch (error) {
    console.error('Error listing tasks:', error);
    res.status(500).json({ message: 'Error al listar tareas' });
  }
});

// GET /tasks/:id - Obtener tarea específica
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub || req.user.id;
    const roles = normalizeRoles(req.user?.roles);
    const isAdmin = roles.includes('admin');

    const task = await Task.findById(req.params.id)
      .populate('assignedTo', 'name email')
      .populate('createdBy', 'name email')
      .populate('client', 'fullName documentNumber')
      .populate('comments.user', 'name email');

    if (!task || !task.isActive) {
      return res.status(404).json({ message: 'Tarea no encontrada' });
    }

    // Verificar permisos
    if (!isAdmin && task.assignedTo._id.toString() !== userId) {
      return res.status(403).json({ message: 'No tienes acceso a esta tarea' });
    }

    res.json({ task });
  } catch (error) {
    console.error('Error getting task:', error);
    res.status(500).json({ message: 'Error al obtener tarea' });
  }
});

// POST /tasks - Crear nueva tarea
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const {
      title,
      description,
      assignedTo,
      client,
      clientName,
      dueDate,
      priority = 'media',
      category = 'otro',
      tags = [],
      radicado,
      estimatedHours
    } = req.body;

    const userId = req.user.sub || req.user.id;

    // Validaciones básicas
    if (!title || !assignedTo || !dueDate) {
      return res.status(400).json({
        message: 'Campos requeridos: title, assignedTo, dueDate'
      });
    }

    // Verificar que el usuario asignado existe
    const assignedUser = await User.findById(assignedTo);
    if (!assignedUser) {
      return res.status(400).json({ message: 'Usuario asignado no encontrado' });
    }

    // Verificar cliente si se proporciona
    let clientData = null;
    if (client) {
      clientData = await Client.findById(client);
      if (!clientData) {
        return res.status(400).json({ message: 'Cliente no encontrado' });
      }
    }

    // Crear la tarea
    const task = new Task({
      title,
      description,
      assignedTo,
      createdBy: userId,
      client: client || null,
      clientName: clientName || clientData?.fullName || '',
      dueDate: new Date(dueDate),
      priority,
      category,
      tags: Array.isArray(tags) ? tags : [],
      radicado,
      estimatedHours
    });

    // Crear alerta de recordatorio (24 horas antes)
    const reminderDate = new Date(dueDate);
    reminderDate.setDate(reminderDate.getDate() - 1);
    
    if (reminderDate > new Date()) {
      task.addAlert('recordatorio', reminderDate, 'Recordatorio: tarea vence mañana');
    }

    await task.save();

    // Poblar datos para respuesta
    await task.populate('assignedTo', 'name email');
    await task.populate('createdBy', 'name email');
    if (client) {
      await task.populate('client', 'fullName documentNumber');
    }

    res.status(201).json({ task });
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ message: 'Error al crear tarea' });
  }
});

// PUT /tasks/:id - Actualizar tarea
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub || req.user.id;
    const roles = normalizeRoles(req.user?.roles);
    const isAdmin = roles.includes('admin');

    const task = await Task.findById(req.params.id);
    if (!task || !task.isActive) {
      return res.status(404).json({ message: 'Tarea no encontrada' });
    }

    // Verificar permisos
    const canEdit = isAdmin || task.assignedTo.toString() === userId || task.createdBy.toString() === userId;
    if (!canEdit) {
      return res.status(403).json({ message: 'No tienes permisos para editar esta tarea' });
    }

    const {
      title,
      description,
      status,
      priority,
      dueDate,
      assignedTo,
      client,
      clientName,
      tags,
      radicado,
      estimatedHours,
      actualHours
    } = req.body;

    // Actualizar campos permitidos
    if (title !== undefined) task.title = title;
    if (description !== undefined) task.description = description;
    if (status !== undefined) task.status = status;
    if (priority !== undefined) task.priority = priority;
    if (dueDate !== undefined) task.dueDate = new Date(dueDate);
    if (clientName !== undefined) task.clientName = clientName;
    if (radicado !== undefined) task.radicado = radicado;
    if (estimatedHours !== undefined) task.estimatedHours = estimatedHours;
    if (actualHours !== undefined) task.actualHours = actualHours;

    // Solo admins pueden cambiar asignación
    if (assignedTo !== undefined && isAdmin) {
      const assignedUser = await User.findById(assignedTo);
      if (!assignedUser) {
        return res.status(400).json({ message: 'Usuario asignado no encontrado' });
      }
      task.assignedTo = assignedTo;
    }

    // Solo admins pueden cambiar cliente
    if (client !== undefined && isAdmin) {
      if (client) {
        const clientData = await Client.findById(client);
        if (!clientData) {
          return res.status(400).json({ message: 'Cliente no encontrado' });
        }
        task.client = client;
      } else {
        task.client = null;
      }
    }

    if (tags !== undefined) {
      task.tags = Array.isArray(tags) ? tags : [];
    }

    task.version += 1;
    await task.save();

    // Poblar datos para respuesta
    await task.populate('assignedTo', 'name email');
    await task.populate('createdBy', 'name email');
    if (task.client) {
      await task.populate('client', 'fullName documentNumber');
    }

    res.json({ task });
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ message: 'Error al actualizar tarea' });
  }
});

// DELETE /tasks/:id - Eliminar tarea (soft delete)
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task || !task.isActive) {
      return res.status(404).json({ message: 'Tarea no encontrada' });
    }

    task.isActive = false;
    await task.save();

    res.json({ message: 'Tarea eliminada correctamente' });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ message: 'Error al eliminar tarea' });
  }
});

// POST /tasks/:id/comments - Agregar comentario
router.post('/:id/comments', requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub || req.user.id;
    const roles = normalizeRoles(req.user?.roles);
    const isAdmin = roles.includes('admin');
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ message: 'El comentario no puede estar vacío' });
    }

    const task = await Task.findById(req.params.id);
    if (!task || !task.isActive) {
      return res.status(404).json({ message: 'Tarea no encontrada' });
    }

    // Verificar permisos
    const canComment = isAdmin || task.assignedTo.toString() === userId || task.createdBy.toString() === userId;
    if (!canComment) {
      return res.status(403).json({ message: 'No tienes permisos para comentar en esta tarea' });
    }

    await task.addComment(userId, text.trim());
    await task.populate('comments.user', 'name email');

    res.json({ 
      message: 'Comentario agregado',
      comments: task.comments 
    });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ message: 'Error al agregar comentario' });
  }
});

// GET /tasks/stats/dashboard - Estadísticas para dashboard
router.get('/stats/dashboard', requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub || req.user.id;
    const roles = normalizeRoles(req.user?.roles);
    const isAdmin = roles.includes('admin');

    let filter = { isActive: true };
    if (!isAdmin) {
      filter.assignedTo = userId;
    }

    const [
      myTasks,
      pendingTasks,
      inProgressTasks,
      overdueTasks,
      upcomingTasks
    ] = await Promise.all([
      Task.countDocuments({ ...filter, assignedTo: userId }),
      Task.countDocuments({ ...filter, status: 'pendiente' }),
      Task.countDocuments({ ...filter, status: 'en-curso' }),
      Task.countDocuments({
        ...filter,
        dueDate: { $lt: new Date() },
        status: { $in: ['pendiente', 'en-curso'] }
      }),
      Task.countDocuments({
        ...filter,
        dueDate: {
          $gte: new Date(),
          $lte: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) // Próximos 3 días
        },
        status: { $in: ['pendiente', 'en-curso'] }
      })
    ]);

    // Tareas recientes para el dashboard
    const recentTasks = await Task.find({
      assignedTo: userId,
      isActive: true,
      status: { $in: ['pendiente', 'en-curso'] }
    })
    .populate('client', 'fullName')
    .sort({ dueDate: 1 })
    .limit(5);

    res.json({
      stats: {
        myTasks,
        pending: pendingTasks,
        inProgress: inProgressTasks,
        overdue: overdueTasks,
        upcoming: upcomingTasks
      },
      recentTasks: recentTasks.map(task => ({
        id: task._id,
        title: task.title,
        client: task.clientName || task.client?.fullName || 'Sin cliente',
        dueDate: task.dueDate,
        priority: task.priority,
        status: task.status,
        isOverdue: task.isOverdue
      }))
    });
  } catch (error) {
    console.error('Error getting dashboard stats:', error);
    res.status(500).json({ message: 'Error al obtener estadísticas' });
  }
});

module.exports = router;


