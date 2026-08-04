'use strict';

const jwt = require('jsonwebtoken');

// RNF005: acceso a recursos mediante token de sesión firmado, con
// vencimiento definido y validación en cada solicitud.
function requireAuth(req, res, next) {
  const header = req.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Token de sesión no provisto.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = { id_usuario: payload.id_usuario, email: payload.email };
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token de sesión inválido o vencido.' });
  }
}

module.exports = { requireAuth };
