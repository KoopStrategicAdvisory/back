'use strict';

// Un usuario cuyo UNICO rol es 'cliente' (ningun rol de staff) solo debe ver
// su propio expediente y lo que cuelga de el — nunca el de otro cliente.
// Sin este middleware, cualquier autenticado con rol 'cliente' podia listar
// TODOS los expedientes/tareas/documentos de la firma con solo cambiar el
// id_expediente en la query o en la URL (los endpoints ya construidos solo
// chequeaban authenticate(), no de quien era cada fila).

const STAFF_ROLES = new Set([
  'admin', 'super_admin', 'socio', 'abogado', 'asociado', 'junior',
  'paralegal', 'secretario', 'contador', 'emprendedor',
]);

function isClientOnly(req) {
  const roles = Array.isArray(req.user?.roles) ? req.user.roles.map((r) => String(r).toLowerCase()) : [];
  if (roles.length === 0) return false;
  return roles.every((r) => !STAFF_ROLES.has(r));
}

function clienteIdOf(req) {
  const id = req.user?.id_cliente;
  return id != null ? Number(id) : null;
}

// Para GET /expedientes (lista): si el usuario es solo-cliente, valida que
// tenga cliente vinculado y deja el id disponible en req.forcedIdCliente
// para que el handler lo use en vez de lo que venga en la query (se hace asi,
// sin mutar req.query, porque en Express 5 req.query es un getter que se
// recalcula en cada acceso — mutarlo en un middleware no persiste al handler).
function scopeExpedientesQuery(req, res, next) {
  if (!isClientOnly(req)) return next();
  const idCliente = clienteIdOf(req);
  if (!idCliente) return res.status(403).json({ message: 'Tu cuenta no está vinculada a ningún cliente.' });
  req.forcedIdCliente = idCliente;
  next();
}

// Para endpoints que reciben id_expediente por query (tareas, actuaciones,
// audiencias, documentos): exige el parametro y verifica que ese expediente
// sea del cliente autenticado antes de dejar pasar la peticion.
function requireOwnExpedienteQuery(findExpedienteById) {
  return async (req, res, next) => {
    if (!isClientOnly(req)) return next();
    const idCliente = clienteIdOf(req);
    if (!idCliente) return res.status(403).json({ message: 'Tu cuenta no está vinculada a ningún cliente.' });
    const idExpediente = req.query.id_expediente ? Number(req.query.id_expediente) : null;
    if (!idExpediente) return res.status(400).json({ message: 'id_expediente es requerido.' });
    try {
      const exp = await findExpedienteById(idExpediente);
      if (!exp || Number(exp.id_cliente) !== idCliente) {
        return res.status(404).json({ message: 'No encontrado.' });
      }
      next();
    } catch (err) { next(err); }
  };
}

// Para GET /:id de una fila ya cargada (expediente, documento, tarea...):
// confirma que pertenezca al cliente autenticado. Devuelve 404 (no 403) para
// no revelar que la fila existe si es de otro cliente. Responde y retorna
// false si debe cortar la ejecucion; true si puede seguir.
function assertOwnCliente(req, res, rowIdCliente) {
  if (!isClientOnly(req)) return true;
  const idCliente = clienteIdOf(req);
  if (!idCliente || Number(rowIdCliente) !== idCliente) {
    res.status(404).json({ message: 'No encontrado.' });
    return false;
  }
  return true;
}

module.exports = {
  isClientOnly,
  clienteIdOf,
  scopeExpedientesQuery,
  requireOwnExpedienteQuery,
  assertOwnCliente,
};
