'use strict';

const potreroRepository = require('../database/sql/potrero.repository');
const estanciaRepository = require('../database/sql/estancia.repository');
const { setPotreroGeom } = require('../database/sql/geometry.repository');
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../database/sequelize');
const { validateAndNormalizePolygon } = require('../database/sql/geometryValidation');

async function create(req, res) {
  const { id_estancia, nombre, descripcion, superficie_ha, activo, geom } = req.body;
  if (!id_estancia || !nombre) {
    return res.status(400).json({ error: 'id_estancia y nombre son obligatorios.' });
  }

  let normalizedGeom;
  if (geom) {
    try {
      normalizedGeom = validateAndNormalizePolygon(geom);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    const inside = await isPolygonWithinEstancia(id_estancia, normalizedGeom);
    if (!inside) {
      return res.status(400).json({
        error: 'El potrero debe quedar dentro de la estancia asociada.',
      });
    }

    const overlaps = await hasPotreroOverlap(id_estancia, normalizedGeom);
    if (overlaps) {
      return res.status(400).json({
        error: 'El potrero se solapa con otro potrero de la misma estancia.',
      });
    }
  }

  try {
    const potrero = await potreroRepository.createPotrero({
      id_estancia,
      nombre,
      descripcion,
      superficie_ha,
      activo,
    });

    if (normalizedGeom) {
      await setPotreroGeom(potrero.id_potrero, normalizedGeom);
      potrero.geom = normalizedGeom;
    }

    return res.status(201).json(potrero);
  } catch (error) {
    return res.status(500).json({ error: 'Error al crear el potrero.' });
  }
}

async function getById(req, res) {
  const potrero = await potreroRepository.getPotreroById(req.params.id);
  if (!potrero) {
    return res.status(404).json({ error: 'Potrero no encontrado.' });
  }
  return res.json(potrero);
}

async function updateGeometria(req, res) {
  const existing = await potreroRepository.getPotreroById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Potrero no encontrado.' });
  }

  let normalized;
  try {
    normalized = validateAndNormalizePolygon(req.body);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const inside = await isPolygonWithinEstancia(existing.id_estancia, normalized);
  if (!inside) {
    return res.status(400).json({
      error: 'El potrero debe quedar dentro de la estancia asociada.',
    });
  }

  const overlaps = await hasPotreroOverlap(existing.id_estancia, normalized, existing.id_potrero);
  if (overlaps) {
    return res.status(400).json({
      error: 'El potrero se solapa con otro potrero de la misma estancia.',
    });
  }

  try {
    const geom = await setPotreroGeom(req.params.id, normalized);
    return res.json({ id_potrero: Number(req.params.id), geom });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

async function isPolygonWithinEstancia(idEstancia, polygon) {
  const [row] = await sequelize.query(
    `SELECT ST_Within(
       ST_GeomFromGeoJSON(:geojson, 1, 4326),
       geom
     ) AS inside
     FROM \`estancia\`
     WHERE id_estancia = :id`,
    {
      replacements: {
        geojson: JSON.stringify(polygon),
        id: idEstancia,
      },
      type: QueryTypes.SELECT,
    }
  );
  return Boolean(row?.inside);
}

async function hasPotreroOverlap(idEstancia, polygon, excludePotreroId = null) {
  const excludeClause = excludePotreroId ? 'AND id_potrero != :excludeId' : '';
  const replacements = {
    idEstancia,
    geojson: JSON.stringify(polygon),
    excludeId: excludePotreroId,
  };

  const [row] = await sequelize.query(
    `SELECT COUNT(*) AS total
     FROM \`potrero\`
     WHERE id_estancia = :idEstancia
       AND geom IS NOT NULL
       ${excludeClause}
       AND ST_Intersects(
         geom,
         ST_GeomFromGeoJSON(:geojson, 1, 4326)
       )`,
    { replacements, type: QueryTypes.SELECT }
  );

  return Number(row.total) > 0;
}

module.exports = { create, getById, updateGeometria };
