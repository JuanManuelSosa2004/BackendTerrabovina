'use strict';

const { QueryTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const SELECT_FIELDS = 'id_observacion, id_potrero, fuente, fecha, ndvi, nubosidad, created_at';

async function getUltimaByPotrero(id_potrero) {
  const rows = await sequelize.query(
    `SELECT ${SELECT_FIELDS} FROM \`observacion_satelital\`
     WHERE id_potrero = :id_potrero ORDER BY fecha DESC, id_observacion DESC LIMIT 1`,
    { replacements: { id_potrero }, type: QueryTypes.SELECT }
  );
  return rows[0] ?? null;
}

async function getHistorialByPotrero(id_potrero, { desde, hasta } = {}) {
  const conditions = ['id_potrero = :id_potrero'];
  const replacements = { id_potrero };
  if (desde) {
    conditions.push('fecha >= :desde');
    replacements.desde = desde;
  }
  if (hasta) {
    conditions.push('fecha <= :hasta');
    replacements.hasta = hasta;
  }

  return sequelize.query(
    `SELECT ${SELECT_FIELDS} FROM \`observacion_satelital\`
     WHERE ${conditions.join(' AND ')}
     ORDER BY fecha DESC`,
    { replacements, type: QueryTypes.SELECT }
  );
}

async function crearObservacion({ id_potrero, fuente, fecha, ndvi, nubosidad }, transaction) {
  const [insertId] = await sequelize.query(
    `INSERT INTO \`observacion_satelital\` (id_potrero, fuente, fecha, ndvi, nubosidad, created_at)
     VALUES (:id_potrero, :fuente, :fecha, :ndvi, :nubosidad, NOW())`,
    {
      replacements: { id_potrero, fuente, fecha, ndvi, nubosidad: nubosidad ?? null },
      type: QueryTypes.INSERT,
      transaction,
    }
  );
  const rows = await sequelize.query(`SELECT ${SELECT_FIELDS} FROM \`observacion_satelital\` WHERE id_observacion = :id`, {
    replacements: { id: insertId },
    type: QueryTypes.SELECT,
    transaction,
  });
  return rows[0];
}

module.exports = { getUltimaByPotrero, getHistorialByPotrero, crearObservacion };
