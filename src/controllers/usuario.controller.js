'use strict';

const usuarioRepository = require('../database/sql/usuario.repository');

async function getMe(req, res) {
  const usuario = await usuarioRepository.getUsuarioById(req.usuario.id_usuario);
  return res.status(200).json(usuario);
}

async function updateMe(req, res) {
  const body = req.body ?? {};
  const fields = {};
  if (body.nombre !== undefined) fields.nombre = body.nombre;
  if (body.telefono !== undefined) fields.telefono = body.telefono;

  const usuario = await usuarioRepository.updateUsuario(req.usuario.id_usuario, fields);
  return res.status(200).json(usuario);
}

module.exports = { getMe, updateMe };
