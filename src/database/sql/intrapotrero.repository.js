'use strict';
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../sequelize');
const { geometryHash } = require('../../services/intrapotrero');
const { parseGeoJsonColumn } = require('./geometryValidation');

async function get(id, hash) {
  const rows = await sequelize.query(
    'SELECT detalle_json FROM analisis_intrapotrero WHERE id_potrero = :id AND geometry_hash = :hash',
    { replacements: { id, hash }, type: QueryTypes.SELECT },
  );
  const data = rows[0]?.detalle_json;
  return typeof data === 'string' ? JSON.parse(data) : data ?? null;
}

async function save(id, hash, data) {
  return sequelize.transaction(async transaction => {
    const rows = await sequelize.query('SELECT ST_AsGeoJSON(geom) AS geom FROM potrero WHERE id_potrero = :id FOR UPDATE', {
      replacements: { id }, type: QueryTypes.SELECT, transaction,
    });
    if (!rows[0] || geometryHash(parseGeoJsonColumn(rows[0].geom)) !== hash) {
      throw new Error('El límite del potrero cambió durante el análisis. Volvé a actualizarlo.');
    }
    await sequelize.query(`INSERT INTO analisis_intrapotrero (id_potrero, geometry_hash, detalle_json, updated_at)
      VALUES (:id, :hash, :data, UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE
      geometry_hash = VALUES(geometry_hash), detalle_json = VALUES(detalle_json), updated_at = UTC_TIMESTAMP()`, {
      replacements: { id, hash, data: JSON.stringify(data) }, type: QueryTypes.INSERT, transaction,
    });
  });
}

module.exports = { get, save };
