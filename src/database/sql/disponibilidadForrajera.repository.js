'use strict';

const { QueryTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

// LEFT JOIN (no INNER): id_observacion es nullable — las filas persistidas
// antes de la migración 20260824000002 no lo tienen, y sin el join
// desaparecerían de todas las lecturas. fecha_observacion es la fecha de
// CAPTURA de la escena, distinta de fecha_calculo (cuándo se corrió el
// modelo); balanceForrajero.service.js#integrarTasa necesita la primera.
const SELECT_FIELDS =
  'df.id_disponibilidad, df.id_potrero, df.fecha_calculo, df.kg_materia_seca_ha, ' +
  'df.superficie_analizada_ha, df.indice_ndvi, df.version_modelo, df.nivel_confianza, ' +
  'df.id_observacion, os.fecha AS fecha_observacion, df.created_at';

const FROM_JOIN =
  'FROM `disponibilidad_forrajera` df ' + 'LEFT JOIN `observacion_satelital` os ON os.id_observacion = df.id_observacion';

// Eje temporal de la serie. La fecha de captura es la única que describe el
// estado del pasto, y es la que integrarTasa necesita para ubicar cada muestra.
// El COALESCE cubre las filas anteriores a la migración 20260824000002, que no
// tienen observación asociada: para ellas la fecha de cálculo es la mejor
// aproximación disponible y así no quedan fuera de la ventana.
const EJE_TEMPORAL = 'COALESCE(os.fecha, df.fecha_calculo)';

async function getUltimaByPotrero(id_potrero) {
  const rows = await sequelize.query(
    `SELECT ${SELECT_FIELDS} ${FROM_JOIN}
     WHERE df.id_potrero = :id_potrero
     ORDER BY ${EJE_TEMPORAL} DESC, df.id_disponibilidad DESC LIMIT 1`,
    { replacements: { id_potrero }, type: QueryTypes.SELECT }
  );
  return rows[0] ?? null;
}

async function getHistoricoByPotrero(id_potrero, { desde, hasta } = {}) {
  const conditions = ['df.id_potrero = :id_potrero'];
  const replacements = { id_potrero };
  if (desde) {
    conditions.push(`${EJE_TEMPORAL} >= :desde`);
    replacements.desde = desde;
  }
  if (hasta) {
    conditions.push(`${EJE_TEMPORAL} <= :hasta`);
    replacements.hasta = hasta;
  }

  return sequelize.query(
    `SELECT ${SELECT_FIELDS} ${FROM_JOIN}
     WHERE ${conditions.join(' AND ')}
     ORDER BY ${EJE_TEMPORAL} DESC, df.id_disponibilidad DESC`,
    { replacements, type: QueryTypes.SELECT }
  );
}

async function crear(
  {
    id_potrero,
    fecha_calculo,
    kg_materia_seca_ha,
    superficie_analizada_ha,
    indice_ndvi,
    version_modelo,
    nivel_confianza,
    id_observacion,
  },
  transaction
) {
  const [insertId] = await sequelize.query(
    `INSERT INTO \`disponibilidad_forrajera\`
       (id_potrero, fecha_calculo, kg_materia_seca_ha, superficie_analizada_ha, indice_ndvi,
        version_modelo, nivel_confianza, id_observacion, created_at)
     VALUES
       (:id_potrero, :fecha_calculo, :kg_materia_seca_ha, :superficie_analizada_ha, :indice_ndvi,
        :version_modelo, :nivel_confianza, :id_observacion, NOW())`,
    {
      replacements: {
        id_potrero,
        fecha_calculo,
        kg_materia_seca_ha,
        superficie_analizada_ha: superficie_analizada_ha ?? null,
        indice_ndvi: indice_ndvi ?? null,
        version_modelo,
        nivel_confianza: nivel_confianza ?? null,
        id_observacion: id_observacion ?? null,
      },
      type: QueryTypes.INSERT,
      transaction,
    }
  );
  const rows = await sequelize.query(`SELECT ${SELECT_FIELDS} ${FROM_JOIN} WHERE df.id_disponibilidad = :id`, {
    replacements: { id: insertId },
    type: QueryTypes.SELECT,
    transaction,
  });
  return rows[0];
}

module.exports = { getUltimaByPotrero, getHistoricoByPotrero, crear };
