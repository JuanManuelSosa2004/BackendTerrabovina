'use strict';

const { QueryTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const SELECT_FIELDS = 'id_dato, id_potrero, fuente, fecha, temperatura, precipitacion, humedad, created_at';

async function getUltimoByPotrero(id_potrero) {
  const rows = await sequelize.query(
    `SELECT ${SELECT_FIELDS} FROM \`dato_climatico\`
     WHERE id_potrero = :id_potrero ORDER BY fecha DESC, id_dato DESC LIMIT 1`,
    { replacements: { id_potrero }, type: QueryTypes.SELECT }
  );
  return rows[0] ?? null;
}

async function crearDato({ id_potrero, fuente, fecha, temperatura, precipitacion, humedad }) {
  const [insertId] = await sequelize.query(
    `INSERT INTO \`dato_climatico\` (id_potrero, fuente, fecha, temperatura, precipitacion, humedad, created_at)
     VALUES (:id_potrero, :fuente, :fecha, :temperatura, :precipitacion, :humedad, NOW())`,
    {
      replacements: {
        id_potrero,
        fuente,
        fecha,
        temperatura: temperatura ?? null,
        precipitacion: precipitacion ?? null,
        humedad: humedad ?? null,
      },
      type: QueryTypes.INSERT,
    }
  );
  const rows = await sequelize.query(`SELECT ${SELECT_FIELDS} FROM \`dato_climatico\` WHERE id_dato = :id`, {
    replacements: { id: insertId },
    type: QueryTypes.SELECT,
  });
  return rows[0];
}

module.exports = { getUltimoByPotrero, crearDato };
