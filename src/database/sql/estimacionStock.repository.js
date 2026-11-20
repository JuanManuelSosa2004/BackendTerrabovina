'use strict';

const { QueryTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const SELECT_FIELDS = `id_estimacion_stock, id_potrero, id_estimacion_demanda,
  fecha_inicio, fecha_objetivo, fecha_calculo, superficie_ha,
  consumo_diario_total_kg_ms, consumo_diario_kg_ms_ha, consumo_acumulado_kg_ms_ha,
  crecimiento_bruto_kg_ms_ha_dia, crecimiento_utilizable_kg_ms_ha_dia,
  produccion_utilizable_kg_ms_ha, stock_inicial_min_kg_ms_ha,
  stock_inicial_central_kg_ms_ha, stock_inicial_max_kg_ms_ha,
  stock_final_min_kg_ms_ha, stock_final_central_kg_ms_ha,
  stock_final_max_kg_ms_ha, stock_final_total_kg_ms, ecorregion,
  unidad_vegetacion, seleccion_regional_estado, confianza_geografica,
  confianza_ambiental, confianza_satelital, confianza_historica,
  confianza_stock_inicial, estado, version_metodologia, detalle_json, created_at`;

function normalizeRow(row) {
  if (!row) return null;
  let detalle = row.detalle_json;
  if (typeof detalle === 'string') {
    try { detalle = JSON.parse(detalle); } catch { /* conservar respuesta original */ }
  }
  return { ...row, detalle_json: detalle };
}

async function getUltimaByPotrero(id_potrero, transaction) {
  const rows = await sequelize.query(
    `SELECT ${SELECT_FIELDS} FROM estimacion_stock WHERE id_potrero = :id_potrero
     ORDER BY fecha_calculo DESC, id_estimacion_stock DESC LIMIT 1`,
    { replacements: { id_potrero }, type: QueryTypes.SELECT, transaction }
  );
  return normalizeRow(rows[0]);
}

async function getHistoricoByPotrero(id_potrero, { desde, hasta, vista } = {}) {
  const conditions = ['id_potrero = :id_potrero'];
  const replacements = { id_potrero };
  if (desde) { conditions.push('fecha_objetivo >= :desde'); replacements.desde = desde; }
  if (hasta) { conditions.push('fecha_objetivo <= :hasta'); replacements.hasta = hasta; }
  if (vista === 'grafico') {
    // The chart shows the last usable revision per target day, including zero.
    return sequelize.query(
      `WITH revisiones AS (
         SELECT id_estimacion_stock, fecha_objetivo, fecha_calculo, stock_final_central_kg_ms_ha,
                ROW_NUMBER() OVER (
                  PARTITION BY fecha_objetivo ORDER BY fecha_calculo DESC, id_estimacion_stock DESC
                ) AS orden
         FROM estimacion_stock
         WHERE ${conditions.join(' AND ')} AND stock_final_central_kg_ms_ha >= 0
       )
       SELECT id_estimacion_stock, fecha_objetivo, fecha_calculo, stock_final_central_kg_ms_ha
       FROM revisiones WHERE orden = 1 ORDER BY fecha_objetivo ASC`,
      { replacements, type: QueryTypes.SELECT }
    );
  }
  const rows = await sequelize.query(
    `SELECT ${SELECT_FIELDS} FROM estimacion_stock WHERE ${conditions.join(' AND ')}
     ORDER BY fecha_objetivo DESC, id_estimacion_stock DESC`,
    { replacements, type: QueryTypes.SELECT }
  );
  return rows.map(normalizeRow);
}

async function crear(values, transaction) {
  const columns = Object.keys(values);
  const [insertId] = await sequelize.query(
    `INSERT INTO estimacion_stock (${columns.map((name) => `\`${name}\``).join(', ')})
     VALUES (${columns.map((name) => `:${name}`).join(', ')})`,
    {
      replacements: { ...values, detalle_json: JSON.stringify(values.detalle_json) },
      type: QueryTypes.INSERT,
      transaction,
    }
  );
  const rows = await sequelize.query(
    `SELECT ${SELECT_FIELDS} FROM estimacion_stock WHERE id_estimacion_stock = :id`,
    { replacements: { id: insertId }, type: QueryTypes.SELECT, transaction }
  );
  return normalizeRow(rows[0]);
}

module.exports = { getUltimaByPotrero, getHistoricoByPotrero, crear };
