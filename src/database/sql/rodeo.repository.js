'use strict';

const { QueryTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const UPDATABLE_FIELDS = ['nombre', 'descripcion', 'activo'];

async function createRodeo({ id_estancia, id_potrero_actual, nombre, descripcion, activo }) {
  const [insertId] = await sequelize.query(
    `INSERT INTO \`rodeo\`
       (id_estancia, id_potrero_actual, nombre, descripcion, activo, created_at, updated_at)
     VALUES
       (:id_estancia, :id_potrero_actual, :nombre, :descripcion, :activo, NOW(), NOW())`,
    {
      replacements: {
        id_estancia,
        id_potrero_actual: id_potrero_actual ?? null,
        nombre,
        descripcion: descripcion ?? null,
        activo: activo === undefined ? true : activo,
      },
      type: QueryTypes.INSERT,
    }
  );
  return getRodeoById(insertId);
}

async function getRodeoById(id) {
  const rows = await sequelize.query(
    `SELECT id_rodeo, id_estancia, id_potrero_actual, nombre, descripcion, activo,
            created_at, updated_at
     FROM \`rodeo\`
     WHERE id_rodeo = :id`,
    { replacements: { id }, type: QueryTypes.SELECT }
  );
  return rows.length === 0 ? null : rows[0];
}

async function updateRodeo(id, fields) {
  const keys = UPDATABLE_FIELDS.filter((key) => fields[key] !== undefined);
  if (keys.length > 0) {
    const setClause = keys.map((key) => `\`${key}\` = :${key}`).join(', ');
    const replacements = keys.reduce((acc, key) => ({ ...acc, [key]: fields[key] }), { id });
    await sequelize.query(
      `UPDATE \`rodeo\` SET ${setClause}, updated_at = NOW() WHERE id_rodeo = :id`,
      { replacements, type: QueryTypes.UPDATE }
    );
  }
  return getRodeoById(id);
}

async function updateRodeoPotrero(id, idPotreroActual) {
  await sequelize.query(
    `UPDATE \`rodeo\` SET id_potrero_actual = :id_potrero_actual, updated_at = NOW()
     WHERE id_rodeo = :id`,
    {
      replacements: { id, id_potrero_actual: idPotreroActual ?? null },
      type: QueryTypes.UPDATE,
    }
  );
  return getRodeoById(id);
}

module.exports = { createRodeo, getRodeoById, updateRodeo, updateRodeoPotrero };
