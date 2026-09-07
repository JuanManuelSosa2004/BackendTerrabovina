'use strict';
const { validateAndNormalizePolygon } = require('../database/sql/geometryValidation');

// Read-only preview. Only anonymous, locally clipped occupied geometry is returned.
function createBoundaryPreview({ sequelize, QueryTypes, assertValidPolygon }) {
  return async function preview(req, res) {
    let polygon;
    try {
      if ((req.body?.geom?.coordinates?.flat()?.length ?? 0) > 500) throw new Error('Usá como máximo 500 vértices.');
      polygon = validateAndNormalizePolygon(req.body?.geom);
      await assertValidPolygon(polygon);
    } catch (error) { return res.status(400).json({ error: error.message }); }
    const points = polygon.coordinates.flat();
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    const margin = 0.002;
    const west = Math.max(-179.999, Math.min(...xs) - margin);
    const east = Math.min(180, Math.max(...xs) + margin);
    const south = Math.max(-89.999, Math.min(...ys) - margin);
    const north = Math.min(89.999, Math.max(...ys) + margin);
    if (east - west > 1 || north - south > 1) {
      return res.status(400).json({ error: 'Acercá el mapa y dibujá un límite de menor extensión para verificarlo.' });
    }
    const box = { type: 'Polygon', coordinates: [[[west,south],[east,south],[east,north],[west,north],[west,south]]] };
    const rows = await sequelize.query(`SELECT
      ST_AsGeoJSON(ST_Intersection(geom, ST_GeomFromGeoJSON(:box, 1, 4326))) AS geom,
      ST_Intersects(geom, ST_GeomFromGeoJSON(:polygon, 1, 4326)) AS conflicto
      FROM estancia WHERE activo = TRUE AND geom IS NOT NULL
      AND ST_Intersects(geom, ST_GeomFromGeoJSON(:box, 1, 4326)) LIMIT 201`, {
      replacements: { box: JSON.stringify(box), polygon: JSON.stringify(polygon) }, type: QueryTypes.SELECT,
    });
    const truncated = rows.length > 200;
    res.set('Cache-Control', 'no-store');
    return res.json({
      disponible: !truncated && !rows.some(r => Number(r.conflicto) === 1),
      incompleto: truncated,
      zonas: rows.slice(0, 200).map(r => ({
        geom: typeof r.geom === 'string' ? JSON.parse(r.geom) : r.geom,
        conflicto: Number(r.conflicto) === 1,
      })),
    });
  };
}
module.exports = { createBoundaryPreview };
