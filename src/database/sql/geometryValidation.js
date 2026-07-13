'use strict';

const MIN_VERTICES = 3;

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function pointsEqual(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}

function validateRing(ring) {
  if (!Array.isArray(ring) || ring.length < MIN_VERTICES) {
    throw new Error('Cada anillo del polígono debe tener al menos 3 vértices.');
  }

  for (const point of ring) {
    if (!Array.isArray(point) || point.length < 2) {
      throw new Error('Cada punto debe ser un array [longitud, latitud].');
    }
    const [lon, lat] = point;
    if (!isFiniteNumber(lon) || !isFiniteNumber(lat)) {
      throw new Error('Las coordenadas deben ser números.');
    }
    if (lon < -180 || lon > 180) {
      throw new Error(`Longitud fuera de rango [-180, 180]: ${lon}`);
    }
    if (lat < -90 || lat > 90) {
      throw new Error(`Latitud fuera de rango [-90, 90]: ${lat}`);
    }
  }
}

function closeRing(ring) {
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!pointsEqual(first, last)) {
    return [...ring, [first[0], first[1]]];
  }
  return ring;
}

/**
 * Valida un GeoJSON Polygon (punto 11 del pedido) y devuelve una copia
 * normalizada con los anillos cerrados, lista para persistir.
 */
function validateAndNormalizePolygon(geojson) {
  if (typeof geojson !== 'object' || geojson === null || Array.isArray(geojson)) {
    throw new Error('geom debe ser un objeto GeoJSON.');
  }
  if (geojson.type !== 'Polygon') {
    throw new Error('geom.type debe ser "Polygon".');
  }
  if (!Array.isArray(geojson.coordinates) || geojson.coordinates.length === 0) {
    throw new Error('geom.coordinates debe ser un array con al menos un anillo.');
  }

  const coordinates = geojson.coordinates.map((ring) => {
    validateRing(ring);
    return closeRing(ring);
  });

  return { type: 'Polygon', coordinates };
}

/**
 * ST_AsGeoJSON() devuelve un valor MySQL de tipo JSON, que mysql2 ya
 * deserializa a objeto JS. Esta función tolera ambos casos (objeto ya
 * parseado o string JSON) según el driver/versión.
 */
function parseGeoJsonColumn(value) {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? JSON.parse(value) : value;
}

module.exports = { validateAndNormalizePolygon, parseGeoJsonColumn };
