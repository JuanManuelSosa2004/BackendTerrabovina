'use strict';

const { QueryTypes } = require('sequelize');
const { sequelize } = require('../sequelize');
const { validateAndNormalizePolygon, parseGeoJsonColumn } = require('./geometryValidation');

/**
 * @typedef {[number, number]} Position
 * @typedef {{ type: 'Polygon', coordinates: Position[][] }} PolygonGeoJSON
 */

/**
 * Nota de comportamiento real (punto 9 del pedido): Sequelize no persiste
 * GeoJSON directamente en una columna GEOMETRY de forma confiable en MySQL
 * (internamente lo pasa por su propio parser WKB/WKT). Por eso toda lectura y
 * escritura de `geom` pasa siempre por SQL puro con `ST_AsGeoJSON` /
 * `ST_GeomFromGeoJSON`, nunca por `Model.create/update` con el atributo geom.
 */
function buildGeometryRepository(tableName, idColumn) {
  /** @returns {Promise<PolygonGeoJSON|null>} */
  async function getGeom(id) {
    const rows = await sequelize.query(
      `SELECT ST_AsGeoJSON(geom) AS geom FROM \`${tableName}\` WHERE \`${idColumn}\` = :id`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );
    if (rows.length === 0) {
      return undefined; // fila inexistente
    }
    return parseGeoJsonColumn(rows[0].geom);
  }

  /** Sobrescribe la geometría completa. @returns {Promise<PolygonGeoJSON>} */
  async function setGeom(id, geojson) {
    const normalized = validateAndNormalizePolygon(geojson);
    await sequelize.query(
      `UPDATE \`${tableName}\` SET geom = ST_GeomFromGeoJSON(:geojson, 1, 4326) WHERE \`${idColumn}\` = :id`,
      { replacements: { geojson: JSON.stringify(normalized), id } }
    );
    return normalized;
  }

  async function deleteGeom(id) {
    await sequelize.query(`UPDATE \`${tableName}\` SET geom = NULL WHERE \`${idColumn}\` = :id`, {
      replacements: { id },
    });
  }

  return { getGeom, setGeom, deleteGeom };
}

const estanciaGeom = buildGeometryRepository('estancia', 'id_estancia');
const potreroGeom = buildGeometryRepository('potrero', 'id_potrero');

module.exports = {
  getEstanciaGeom: estanciaGeom.getGeom,
  setEstanciaGeom: estanciaGeom.setGeom,
  deleteEstanciaGeom: estanciaGeom.deleteGeom,

  getPotreroGeom: potreroGeom.getGeom,
  setPotreroGeom: potreroGeom.setGeom,
  deletePotreroGeom: potreroGeom.deleteGeom,
};
