'use strict';

const { QueryTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const SELECT_FIELDS =
  'id_disponibilidad, id_potrero, fecha_calculo, kg_materia_seca_ha, superficie_analizada_ha, indice_ndvi, version_modelo, nivel_confianza, created_at';

async function getUltimaByPotrero(id_potrero) {
  const rows = await sequelize.query(
    `SELECT ${SELECT_FIELDS} FROM \`disponibilidad_forrajera\`
     WHERE id_potrero = :id_potrero ORDER BY fecha_calculo DESC, id_disponibilidad DESC LIMIT 1`,
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
    `SELECT ${SELECT_FIELDS} FROM \`disponibilidad_forrajera\`
     WHERE ${conditions.join(' AND ')}
     ORDER BY fecha_calculo DESC`,
    { replacements, type: QueryTypes.SELECT }
  );
}

async function crear({ id_potrero, fecha_calculo, kg_materia_seca_ha, superficie_analizada_ha, indice_ndvi, version_modelo, nivel_confianza }) {
  const [insertId] = await sequelize.query(
    `INSERT INTO \`disponibilidad_forrajera\`
       (id_potrero, fecha_calculo, kg_materia_seca_ha, superficie_analizada_ha, indice_ndvi,
        version_modelo, nivel_confianza, created_at)
     VALUES
       (:id_potrero, :fecha_calculo, :kg_materia_seca_ha, :superficie_analizada_ha, :indice_ndvi,
        :version_modelo, :nivel_confianza, NOW())`,
    {
      replacements: {
        id_potrero,
        fecha_calculo,
        kg_materia_seca_ha,
        superficie_analizada_ha: superficie_analizada_ha ?? null,
        indice_ndvi: indice_ndvi ?? null,
        version_modelo,
        nivel_confianza: nivel_confianza ?? null,
      },
      type: QueryTypes.INSERT,
    }
  );
  const rows = await sequelize.query(`SELECT ${SELECT_FIELDS} FROM \`disponibilidad_forrajera\` WHERE id_disponibilidad = :id`, {
    replacements: { id: insertId },
    type: QueryTypes.SELECT,
  });
  return rows[0];
}

module.exports = { getUltimaByPotrero, getHistoricoByPotrero, crear };
