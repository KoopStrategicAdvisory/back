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
];

// Respuesta SIEMPRE igual sin importar si la cedula coincidio con un cliente
// existente o no: si el mensaje cambiara segun el caso, cualquiera podria
// enviar cedulas al azar y usar la respuesta para averiguar quien es cliente
// de la firma (informacion confidencial). El correo real (con o sin aviso
// de "encontramos tu expediente") solo lo ve el dueno de esa bandeja.
const GENERIC_MESSAGE = 'Registro recibido. Revisa tu correo para continuar con la activación de tu cuenta.';

async function handler(req, res, next) {
  try {
    const { nombre, email, password, tipo_documento, numero_documento } = req.body;
    const existing = await users.findByEmail(email);
    if (existing) return res.status(409).json({ message: 'El email ya está registrado.' });

    const password_hash = await bcrypt.hash(password, ROUNDS);

    // Auto-claim: si la cedula coincide con un cliente ya cargado por la
    // firma, se vincula la cuenta nueva a ese cliente (y a todos sus
    // expedientes) automaticamente.
    let clienteMatch = null;
    if (tipo_documento && numero_documento) {
      clienteMatch = await clientes.findByDocumento(tipo_documento, String(numero_documento).trim());
    }

    // Solo se activa por si sola (via link de verificacion) si el cliente
    // encontrado ya tiene un email de contacto en archivo: el link se manda
    // A ESE correo, nunca al que la persona acaba de escribir en el
    // formulario. Asi, conocer la cedula de alguien no basta para entrar a
    // su expediente — hace falta tener acceso a su bandeja real.
    const claimedWithEmail = !!(clienteMatch && clienteMatch.email);

    const email_verification_token = claimedWithEmail ? crypto.randomBytes(32).toString('hex') : null;
    const email_verification_expires = claimedWithEmail
      ? new Date(Date.now() + VERIFY_TOKEN_HOURS * 60 * 60 * 1000)
      : null;

    const user = await users.create({
      nombre,
      email,
      password_hash,
      active: false,
      tipo_documento: tipo_documento || undefined,
      numero_documento: numero_documento || undefined,
      id_cliente: clienteMatch ? clienteMatch.id : undefined,
      email_verification_token,
      email_verification_expires,
    }, null);

    if (claimedWithEmail) {
      const verifyUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-email?token=${email_verification_token}`;
      try {
        await sendVerificationEmail({ to: clienteMatch.email, nombre, verifyUrl, claimed: true });
      } catch (e) {
        console.error('[AUTH] error enviando email de verificación:', e.message);
      }
    }
    // Si no hubo match (o el cliente encontrado no tiene email en archivo),
    // la cuenta queda igual que antes: pendiente de activación manual por
    // un administrador, ya vinculada a id_cliente si se encontró.

    // Toda cuenta creada por auto-registro es un cliente del portal: se le
    // asigna el rol 'cliente' del catalogo. Sin esto la cuenta quedaba
    // activa pero sin ningun rol, sin acceso real a nada en el front.
    try {
      const rolesCliente = await catalogos.roles.findAll({ active: true });
      const rolCliente = rolesCliente.find((r) => r.nombre === 'cliente');
      if (rolCliente) await users.addRole(user.id, rolCliente.id, null);
    } catch (e) {
      console.error('[AUTH] error asignando rol cliente:', e.message);
    }

    return res.status(201).json({
      message: GENERIC_MESSAGE,
      pendingActivation: true,
      user: { id: user.id, nombre: user.nombre, email: user.email, active: user.active },
    });
  } catch (err) { next(err); }
}

module.exports = { method: 'POST', path: '/register', middleware: [...rules, validate], handler };
