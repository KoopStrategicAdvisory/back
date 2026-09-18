'use strict';

// Envio de correos transaccionales via la API HTTP de Resend (sin dependencia
// npm adicional: es un solo POST). Antes no habia ningun servicio de email en
// el proyecto — forgot-password.js, por ejemplo, solo hacia console.log del
// token en vez de enviarlo.

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'Koop Strategic Advisory <onboarding@resend.dev>';

async function sendEmail({ to, subject, html }) {
  if (!RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY no configurada — no se envio el correo a', to);
    return { skipped: true };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: EMAIL_FROM, to, subject, html }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Resend respondio ${res.status}: ${text}`);
  }
  return res.json();
}

function baseTemplate(title, bodyHtml) {
  return `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;color:#1e293b">
      <h2 style="color:#111827;margin-bottom:8px">${title}</h2>
      ${bodyHtml}
      <p style="margin-top:32px;font-size:12px;color:#94a3b8">Koop Strategic Advisory</p>
    </div>
  `;
}

async function sendVerificationEmail({ to, nombre, verifyUrl, claimed }) {
  const claimNote = claimed
    ? `<p>Encontramos un expediente ya registrado a tu nombre en nuestra firma y lo vinculamos a esta cuenta.</p>`
    : '';
  const html = baseTemplate('Confirma tu cuenta', `
    <p>Hola ${nombre || ''},</p>
    <p>Gracias por registrarte en el portal de Koop Strategic Advisory.</p>
    ${claimNote}
    <p>Confirma tu correo para activar tu cuenta:</p>
    <p><a href="${verifyUrl}" style="display:inline-block;background:#4fd1c5;color:#06231f;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Confirmar mi cuenta</a></p>
    <p style="font-size:13px;color:#64748b">Si el botón no funciona, copia y pega este enlace: <br>${verifyUrl}</p>
  `);
  return sendEmail({ to, subject: 'Confirma tu cuenta — Koop Strategic Advisory', html });
}

async function sendPasswordResetEmail({ to, resetUrl }) {
  const html = baseTemplate('Restablecer contraseña', `
    <p>Recibimos una solicitud para restablecer tu contraseña.</p>
    <p><a href="${resetUrl}" style="display:inline-block;background:#4fd1c5;color:#06231f;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Restablecer contraseña</a></p>
    <p style="font-size:13px;color:#64748b">Si no solicitaste esto, ignora este correo. El enlace vence en 1 hora.</p>
  `);
  return sendEmail({ to, subject: 'Restablecer contraseña — Koop Strategic Advisory', html });
}

module.exports = { sendEmail, sendVerificationEmail, sendPasswordResetEmail };
