'use strict';

const { QueryTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

async function createToken({ id_usuario, token_hash, expira_en }) {
  await sequelize.query(
    `INSERT INTO \`password_reset_token\` (id_usuario, token_hash, expira_en, created_at)
     VALUES (:id_usuario, :token_hash, :expira_en, NOW())`,
    { replacements: { id_usuario, token_hash, expira_en }, type: QueryTypes.INSERT }
  );
}

// Sólo devuelve el token si existe, no fue usado y no venció (CA026, CA027).
// La comparación de vencimiento se hace contra un timestamp calculado en
// Node (no `NOW()` de MySQL): el reloj/zona horaria del servidor de base
// de datos no está garantizado que coincida con el del proceso que generó
// `expira_en`, y un desfasaje ahí invalidaría tokens recién emitidos.
async function getValidTokenByHash(token_hash, ahora = new Date()) {
  const rows = await sequelize.query(
    `SELECT id_token, id_usuario, token_hash, expira_en, usado_en
     FROM \`password_reset_token\`
     WHERE token_hash = :token_hash AND usado_en IS NULL AND expira_en > :ahora`,
    { replacements: { token_hash, ahora }, type: QueryTypes.SELECT }
  );
  return rows[0] ?? null;
}

async function markTokenUsed(id_token) {
  await sequelize.query('UPDATE `password_reset_token` SET usado_en = NOW() WHERE id_token = :id_token', {
    replacements: { id_token },
    type: QueryTypes.UPDATE,
  });
}

module.exports = { createToken, getValidTokenByHash, markTokenUsed };
