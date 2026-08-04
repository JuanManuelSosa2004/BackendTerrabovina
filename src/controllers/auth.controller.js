'use strict';

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const usuarioRepository = require('../database/sql/usuario.repository');
const passwordResetTokenRepository = require('../database/sql/passwordResetToken.repository');
const { isDuplicateEntryError } = require('../utils/dbErrors');
const { sendPasswordResetEmail } = require('../services/mailer');

const SALT_ROUNDS = 10;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function signToken(usuario) {
  return jwt.sign({ id_usuario: usuario.id_usuario, email: usuario.email }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '2h',
  });
}

// RF015 / CA022 / CA023
async function registro(req, res) {
  const { nombre, email, password, telefono } = req.body ?? {};

  if (!nombre || !email || !password) {
    return res.status(400).json({ error: 'nombre, email y password son obligatorios.' });
  }
  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: 'El email no tiene un formato válido.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
  }

  try {
    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    const usuario = await usuarioRepository.createUsuario({ nombre, email, password_hash, telefono });
    return res.status(201).json({ usuario, mensaje: 'Registro completado.' });
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      return res.status(409).json({ error: 'El email ya está asociado a una cuenta.' });
    }
    throw error;
  }
}

// RF016 / CA024 / CA025 — mensaje de error genérico: no revela si el
// correo existe, tal como documenta el diagrama de secuencia del PFI.
async function login(req, res) {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email y password son obligatorios.' });
  }

  const usuario = await usuarioRepository.getUsuarioByEmailWithHash(email);
  const passwordValida = usuario ? await bcrypt.compare(password, usuario.password_hash) : false;

  if (!usuario || !passwordValida) {
    return res.status(401).json({ error: 'Credenciales inválidas.' });
  }

  await usuarioRepository.updateUltimoAcceso(usuario.id_usuario);
  const token = signToken(usuario);
  const { password_hash: _omit, ...usuarioPublico } = usuario;

  return res.status(200).json({ usuario: usuarioPublico, token });
}

// RF016 / CA026 — respuesta idéntica exista o no la cuenta, por el mismo
// motivo que el login no revela si el correo está registrado.
async function recuperarContrasena(req, res) {
  const { email } = req.body ?? {};
  if (!email) {
    return res.status(400).json({ error: 'email es obligatorio.' });
  }

  const usuario = await usuarioRepository.getUsuarioByEmailWithHash(email);
  if (usuario) {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const token_hash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const minutos = Number(process.env.PASSWORD_RESET_TOKEN_EXPIRES_MIN) || 30;
    const expira_en = new Date(Date.now() + minutos * 60 * 1000);

    await passwordResetTokenRepository.createToken({ id_usuario: usuario.id_usuario, token_hash, expira_en });

    await sendPasswordResetEmail({ to: usuario.email, rawToken, expiraEn: expira_en });
  }

  return res.status(200).json({ mensaje: 'Si el correo está registrado, se envió un enlace de recuperación.' });
}

// RF016 / CA027
async function restablecerContrasena(req, res) {
  const { token, password } = req.body ?? {};
  if (!token || !password) {
    return res.status(400).json({ error: 'token y password son obligatorios.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
  }

  const token_hash = crypto.createHash('sha256').update(token).digest('hex');
  const tokenValido = await passwordResetTokenRepository.getValidTokenByHash(token_hash);
  if (!tokenValido) {
    return res.status(400).json({ error: 'El token es inválido o venció.' });
  }

  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
  await usuarioRepository.updatePasswordHash(tokenValido.id_usuario, password_hash);
  await passwordResetTokenRepository.markTokenUsed(tokenValido.id_token);

  return res.status(200).json({ mensaje: 'Contraseña actualizada.' });
}

module.exports = { registro, login, recuperarContrasena, restablecerContrasena };
