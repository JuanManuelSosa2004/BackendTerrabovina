'use strict';

const { QueryTypes } = require('sequelize');
const { sequelize } = require('../sequelize');
const { validateAndNormalizePolygon } = require('./geometryValidation');

/**
 * @typedef {[number, number]} Position
 * @typedef {{ type: 'Polygon', coordinates: Position[][] }} PolygonGeoJSON
 */

/**
 * ST_GeomFromGeoJSON() no rechaza polígonos topológicamente inválidos
 * (auto-intersecciones tipo "bowtie"): los parsea igual. Sin este chequeo,
 * ese geom inválido llega crudo a ST_Within/ST_Intersects o a la propia
 * escritura, y MySQL corta con un error de GIS sin capturar (500). Se
 * valida acá, una sola vez, apenas normalizado el GeoJSON y antes de
 * cualquier otra consulta espacial.
 * @param {PolygonGeoJSON} geojson
 */
async function assertValidPolygon(geojson) {
  let row;
  try {
    [row] = await sequelize.query('SELECT ST_IsValid(ST_GeomFromGeoJSON(:geojson, 1, 4326)) AS isValid', {
      replacements: { geojson: JSON.stringify(geojson) },
      type: QueryTypes.SELECT,
    });
  } catch (error) {
    throw new Error('geom no representa un polígono geométricamente válido.');
  }
  if (!row?.isValid) {
    throw new Error('geom no representa un polígono geométricamente válido (revisar auto-intersecciones).');
  }
}

/**
 * Nota de comportamiento real (punto 9 del pedido): Sequelize no persiste
 * GeoJSON directamente en una columna GEOMETRY de forma confiable en MySQL
 * (internamente lo pasa por su propio parser WKB/WKT). Por eso toda lectura y
 * escritura de `geom` pasa siempre por SQL puro con `ST_AsGeoJSON` /
 * `ST_GeomFromGeoJSON`, nunca por `Model.create/update` con el atributo geom.
 */
function buildGeometryRepository(tableName, idColumn) {
  /** Sobrescribe la geometría completa. @returns {Promise<PolygonGeoJSON>} */
  async function setGeom(id, geojson) {
    const normalized = validateAndNormalizePolygon(geojson);
    await sequelize.query(
      `UPDATE \`${tableName}\` SET geom = ST_GeomFromGeoJSON(:geojson, 1, 4326) WHERE \`${idColumn}\` = :id`,
      { replacements: { geojson: JSON.stringify(normalized), id } }
    );
    return normalized;
  }

  return { setGeom };
}

const estanciaGeom = buildGeometryRepository('estancia', 'id_estancia');
const potreroGeom = buildGeometryRepository('potrero', 'id_potrero');

module.exports = {
  assertValidPolygon,
  setEstanciaGeom: estanciaGeom.setGeom,
  setPotreroGeom: potreroGeom.setGeom,
};
