'use strict';

const { QueryTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const PUBLIC_FIELDS = 'id_usuario, nombre, email, telefono, ultimo_acceso, created_at, updated_at';

async function createUsuario({ nombre, email, password_hash, telefono }) {
  const [insertId] = await sequelize.query(
    `INSERT INTO \`usuario\`
       (nombre, email, password_hash, telefono, created_at, updated_at)
     VALUES
       (:nombre, :email, :password_hash, :telefono, NOW(), NOW())`,
    {
      replacements: { nombre, email, password_hash, telefono: telefono ?? null },
      type: QueryTypes.INSERT,
    }
  );
  return getUsuarioById(insertId);
}

async function getUsuarioById(id) {
  const rows = await sequelize.query(`SELECT ${PUBLIC_FIELDS} FROM \`usuario\` WHERE id_usuario = :id`, {
    replacements: { id },
    type: QueryTypes.SELECT,
  });
  return rows[0] ?? null;
}

// Incluye password_hash: sólo para el flujo de autenticación, nunca se
// devuelve al cliente.
async function getUsuarioByEmailWithHash(email) {
  const rows = await sequelize.query(
    `SELECT id_usuario, nombre, email, password_hash, telefono, ultimo_acceso, created_at, updated_at
     FROM \`usuario\` WHERE email = :email`,
    { replacements: { email }, type: QueryTypes.SELECT }
  );
  return rows[0] ?? null;
}

const UPDATABLE_FIELDS = ['nombre', 'telefono'];

async function updateUsuario(id, fields) {
  const entries = Object.entries(fields).filter(([key]) => UPDATABLE_FIELDS.includes(key));
  if (entries.length === 0) return getUsuarioById(id);

  const setClause = entries.map(([key]) => `\`${key}\` = :${key}`).join(', ');
  const replacements = Object.fromEntries(entries);
  replacements.id = id;

  await sequelize.query(`UPDATE \`usuario\` SET ${setClause}, updated_at = NOW() WHERE id_usuario = :id`, {
    replacements,
    type: QueryTypes.UPDATE,
  });
  return getUsuarioById(id);
}

async function updatePasswordHash(id, password_hash) {
  await sequelize.query('UPDATE `usuario` SET password_hash = :password_hash, updated_at = NOW() WHERE id_usuario = :id', {
    replacements: { id, password_hash },
    type: QueryTypes.UPDATE,
  });
}

async function updateUltimoAcceso(id) {
  await sequelize.query('UPDATE `usuario` SET ultimo_acceso = NOW() WHERE id_usuario = :id', {
    replacements: { id },
    type: QueryTypes.UPDATE,
  });
}

module.exports = {
  createUsuario,
  getUsuarioById,
  getUsuarioByEmailWithHash,
  updateUsuario,
  updatePasswordHash,
  updateUltimoAcceso,
};
