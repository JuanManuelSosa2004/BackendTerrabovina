'use strict';

const nodemailer = require('nodemailer');

let transporter = null;

// Un solo transporter reusado entre requests (nodemailer ya pool-ea
// conexiones SMTP internamente); se crea recién al primer envío para no
// exigir SMTP_USER/SMTP_PASS en entornos (tests) que nunca lo usan.
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

// RF016/CA026: entrega el token de recuperación por correo en lugar de
// exponerlo por otro canal. El link solo se arma si hay un frontend
// configurado (FRONTEND_URL); si no, se manda el token a secas para que el
// usuario lo pegue directo en POST /auth/restablecer-contrasena.
async function sendPasswordResetEmail({ to, rawToken, expiraEn }) {
  const link = process.env.FRONTEND_URL
    ? `${process.env.FRONTEND_URL.replace(/\/$/, '')}/restablecer-contrasena?token=${rawToken}`
    : null;

  const vencimiento = expiraEn.toLocaleString('es-AR', { timeZone: 'UTC' });

  const text = link
    ? `Solicitaste recuperar tu contraseña en TerraBovina.\n\nIngresá al siguiente enlace antes de ${vencimiento} UTC:\n${link}\n\nSi no fuiste vos, ignorá este correo.`
    : `Solicitaste recuperar tu contraseña en TerraBovina.\n\nTu token de recuperación (vence ${vencimiento} UTC) es:\n${rawToken}\n\nSi no fuiste vos, ignorá este correo.`;

  await getTransporter().sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    subject: 'Recuperación de contraseña - TerraBovina',
    text,
  });
}

module.exports = { sendPasswordResetEmail };
