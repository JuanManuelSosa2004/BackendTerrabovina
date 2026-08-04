'use strict';

const { QueryTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const SELECT_FIELDS =
  'id_estimacion, id_potrero, fecha_calculo, cantidad_animales, kg_materia_seca_dia, version_modelo, nivel_confianza, created_at';

async function getUltimaByPotrero(id_potrero) {
  const rows = await sequelize.query(
    `SELECT ${SELECT_FIELDS} FROM \`estimacion_demanda\`
     WHERE id_potrero = :id_potrero ORDER BY fecha_calculo DESC, id_estimacion DESC LIMIT 1`,
    { replacements: { id_potrero }, type: QueryTypes.SELECT }
  );
  return rows[0] ?? null;
}

async function getHistoricoByPotrero(id_potrero, { desde, hasta } = {}) {
  const conditions = ['id_potrero = :id_potrero'];
  const replacements = { id_potrero };
  if (desde) {
    conditions.push('fecha_calculo >= :desde');
    replacements.desde = desde;
  }
  if (hasta) {
    conditions.push('fecha_calculo <= :hasta');
    replacements.hasta = hasta;
  }

  return sequelize.query(
    `SELECT ${SELECT_FIELDS} FROM \`estimacion_demanda\`
     WHERE ${conditions.join(' AND ')}
     ORDER BY fecha_calculo DESC`,
    { replacements, type: QueryTypes.SELECT }
  );
}

async function crear({ id_potrero, fecha_calculo, cantidad_animales, kg_materia_seca_dia, version_modelo, nivel_confianza }) {
  const [insertId] = await sequelize.query(
    `INSERT INTO \`estimacion_demanda\`
       (id_potrero, fecha_calculo, cantidad_animales, kg_materia_seca_dia, version_modelo, nivel_confianza, created_at)
     VALUES
       (:id_potrero, :fecha_calculo, :cantidad_animales, :kg_materia_seca_dia, :version_modelo, :nivel_confianza, NOW())`,
    {
      replacements: {
        id_potrero,
        fecha_calculo,
        cantidad_animales,
        kg_materia_seca_dia,
        version_modelo,
        nivel_confianza: nivel_confianza ?? null,
      },
      type: QueryTypes.INSERT,
    }
  );
  const rows = await sequelize.query(`SELECT ${SELECT_FIELDS} FROM \`estimacion_demanda\` WHERE id_estimacion = :id`, {
    replacements: { id: insertId },
    type: QueryTypes.SELECT,
  });
  return rows[0];
}

module.exports = { getUltimaByPotrero, getHistoricoByPotrero, crear };
