'use strict';
const { body } = require('express-validator');
const bcrypt   = require('bcrypt');
const crypto   = require('crypto');
const validate = require('../../middleware/validate');
const { users, clientes, catalogos } = require('../../repositories');
const { sendVerificationEmail } = require('../../services/email');

const ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);
const VERIFY_TOKEN_HOURS = 24;

const rules = [
  body('nombre').trim().notEmpty().withMessage('El nombre es requerido.'),
  body('email').isEmail().normalizeEmail().withMessage('Email inválido.'),
  body('password').isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres.'),
  body('tipo_documento').optional().isIn(['CC', 'CE', 'PA', 'NIT']).withMessage('Tipo de documento inválido.'),
  body('numero_documento').optional().trim(),
  // Opcional: si quien se registra no resulta ser clienta todavia (no hizo
  // match), este es el unico dato de contacto directo que le queda al
  // equipo para poder llamarla si le interesa una asesoria.
  body('telefono').optional({ checkFalsy: true }).trim().isLength({ max: 40 }),
];

// Respuesta SIEMPRE igual sin importar si la cedula coincidio con un cliente
// existente o no: si el mensaje cambiara segun el caso, cualquiera podria
// enviar cedulas al azar y usar la respuesta para averiguar quien es cliente
// de la firma (informacion confidencial). El correo real (con o sin aviso
// de "encontramos tu expediente") solo lo ve el dueno de esa bandeja.
const GENERIC_MESSAGE = 'Registro recibido. Revisa tu correo para continuar con la activación de tu cuenta (si no lo ves en un par de minutos, revisa también la carpeta de spam o correo no deseado).';

async function assignRolCliente(userId) {
  try {
    const rolesCliente = await catalogos.roles.findAll({ active: true });
    const rolCliente = rolesCliente.find((r) => r.nombre === 'cliente');
    if (rolCliente) await users.addRole(userId, rolCliente.id, null); // addRole ya es idempotente (ON CONFLICT DO NOTHING)
  } catch (e) {
    console.error('[AUTH] error asignando rol cliente:', e.message);
  }
}

async function handler(req, res, next) {
  try {
    const { nombre, email, password, tipo_documento, numero_documento, telefono } = req.body;
    const password_hash = await bcrypt.hash(password, ROUNDS);

    // Auto-claim: si la cedula coincide con un cliente ya cargado por la
    // firma, se vincula la cuenta nueva a ese cliente (y a todos sus
    // expedientes) automaticamente.
    let clienteMatch = null;
    if (tipo_documento && numero_documento) {
      clienteMatch = await clientes.findByDocumento(tipo_documento, String(numero_documento).trim());
    }

    // Si esa cedula ya tiene una cuenta vinculada (users.id_cliente es
    // UNIQUE), no se puede crear una fila nueva. Esto pasa todo el tiempo
    // por algo muy normal: alguien escribe mal su correo, le da
    // "Registrarse", y al corregirlo e intentar de nuevo la cedula ya
    // estaba "reclamada" por el primer intento — antes esto tiraba un error
    // confuso. Si esa cuenta anterior sigue sin activarse, se reescribe con
    // los datos nuevos (nombre/correo/password/token) en vez de bloquear.
    let existingClaim = null;
    if (clienteMatch) {
      existingClaim = await users.findByClienteId(clienteMatch.id);
    }

    // Igual de comun: la persona reintenta con el MISMO correo pero el
    // formulario no reenvia la cedula (o la escribe distinto esta vez), asi
    // que el match de arriba no la encuentra. Si ya existe una fila sin
    // activar con ese correo, es el mismo reintento — se retoma esa fila en
    // vez de chocar contra "el email ya esta registrado". Solo se descarta
    // si esa fila pendiente ya quedo vinculada a OTRO cliente distinto al
    // que se acaba de encontrar (para no robarle el pendiente a otra persona).
    if (!existingClaim) {
      const byEmail = await users.findByEmail(email);
      if (byEmail && !byEmail.active) {
        const idClienteEncontrado = clienteMatch ? clienteMatch.id : null;
        const sinConflicto = !byEmail.id_cliente || !idClienteEncontrado || Number(byEmail.id_cliente) === Number(idClienteEncontrado);
        if (sinConflicto) existingClaim = byEmail;
      }
    }

    // Si esta vez si se encontro cliente por cedula y la fila pendiente que
    // se va a reusar todavia no tenia id_cliente, se vincula ahora.
    if (existingClaim && clienteMatch && !existingClaim.id_cliente) {
      existingClaim = (await users.setIdCliente(existingClaim.id, clienteMatch.id)) || existingClaim;
    }

    // Ya existe una cuenta activa para este cliente: no se crea otra ni se
    // reenvia nada (evita que alguien con la cedula de un cliente le
    // "resetee" la cuenta a otra persona). La respuesta se queda igual de
    // generica que siempre.
    if (existingClaim && existingClaim.active) {
      return res.status(201).json({ message: GENERIC_MESSAGE, pendingActivation: true });
    }

    // Conflicto de correo: bloquea solo si el correo ya es de OTRA cuenta
    // distinta a la que se esta reintentando (reenviar el mismo correo, o
    // corregir a uno nuevo, esta permitido mientras sea un reintento del
    // mismo registro pendiente).
    const emailOwner = await users.findByEmail(email);
    if (emailOwner && emailOwner.id !== existingClaim?.id) {
      return res.status(409).json({ message: 'El email ya está registrado.' });
    }

    // Cliente contra el que se valida el correo de contacto para el link de
    // verificacion: el de este intento si mando cedula y hubo match, o si no
    // el que ya tenia vinculado la fila pendiente que se esta reusando (para
    // poder reenviar el correo aunque esta vez no haya vuelto a escribir la
    // cedula).
    let clienteParaEmail = clienteMatch;
    if (!clienteParaEmail && existingClaim?.id_cliente) {
      clienteParaEmail = await clientes.findById(existingClaim.id_cliente);
    }

    // Solo se activa por si sola (via link de verificacion) si el cliente
    // encontrado ya tiene un email de contacto en archivo: el link se manda
    // A ESE correo, nunca al que la persona acaba de escribir en el
    // formulario. Asi, conocer la cedula de alguien no basta para entrar a
    // su expediente — hace falta tener acceso a su bandeja real.
    const claimedWithEmail = !!(clienteParaEmail && clienteParaEmail.email);
    // Si ya habia un token vigente (no vencido) de un intento anterior, se
    // REUTILIZA en vez de generar uno nuevo. Antes cada reintento invalidaba
    // el enlace del correo anterior — si ese correo tardaba en llegar (o el
    // cliente probaba de nuevo mientras tanto), el enlace que finalmente
    // abria ya estaba muerto ("Token invalido o expirado") aunque el correo
    // fuera legitimo y reciente.
    const tokenVigente = existingClaim?.email_verification_token
      && existingClaim?.email_verification_expires
      && new Date(existingClaim.email_verification_expires).getTime() > Date.now();
    const email_verification_token = !claimedWithEmail
      ? null
      : tokenVigente ? existingClaim.email_verification_token : crypto.randomBytes(32).toString('hex');
    const email_verification_expires = !claimedWithEmail
      ? null
      : tokenVigente ? existingClaim.email_verification_expires : new Date(Date.now() + VERIFY_TOKEN_HOURS * 60 * 60 * 1000);

    let user;
    if (existingClaim) {
      user = await users.resetPendingRegistration(existingClaim.id, {
        nombre, email, password_hash, email_verification_token, email_verification_expires,
        telefono_principal: telefono || undefined,
      });
      // Carrera muy poco probable: se activo justo entre el findByClienteId
      // de arriba y este update. Se responde igual, sin reintentar de nuevo.
      if (!user) return res.status(201).json({ message: GENERIC_MESSAGE, pendingActivation: true });
    } else {
      user = await users.create({
        nombre,
        email,
        password_hash,
        active: false,
        tipo_documento: tipo_documento || undefined,
        numero_documento: numero_documento || undefined,
        telefono_principal: telefono || undefined,
        id_cliente: clienteMatch ? clienteMatch.id : undefined,
        email_verification_token,
        email_verification_expires,
      }, null);
    }

    if (claimedWithEmail) {
      const verifyUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-email?token=${email_verification_token}`;
      try {
        await sendVerificationEmail({ to: clienteParaEmail.email, nombre, verifyUrl, claimed: true });
      } catch (e) {
        // No se debe dejar esto en silencio: si Resend falla (dominio no
        // verificado, limite de envios, etc.) la persona queda con una
        // cuenta pendiente para siempre y ningun aviso de que algo fallo.
        console.error('[AUTH] error enviando email de verificación a', clienteParaEmail.email, ':', e.message);
      }
    }
    // Si no hubo match (o el cliente encontrado no tiene email en archivo),
    // la cuenta queda igual que antes: pendiente de activación manual por
    // un administrador, ya vinculada a id_cliente si se encontró.

    // Toda cuenta creada por auto-registro es un cliente del portal: se le
    // asigna el rol 'cliente' del catalogo. Sin esto la cuenta quedaba
    // activa pero sin ningun rol, sin acceso real a nada en el front.
    await assignRolCliente(user.id);

    return res.status(201).json({
      message: GENERIC_MESSAGE,
      pendingActivation: true,
      user: { id: user.id, nombre: user.nombre, email: user.email, active: user.active },
    });
  } catch (err) { next(err); }
}

module.exports = { method: 'POST', path: '/register', middleware: [...rules, validate], handler };
