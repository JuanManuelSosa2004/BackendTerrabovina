'use strict';

const potreroRepository = require('../database/sql/potrero.repository');
const asignacionGanadoRepository = require('../database/sql/asignacionGanado.repository');
const { setPotreroGeom, assertValidPolygon } = require('../database/sql/geometry.repository');
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../database/sequelize');
const { validateAndNormalizePolygon } = require('../database/sql/geometryValidation');

// #12: requireEstanciaOwnership ya validó pertenencia y cargó req.estancia.
async function create(req, res) {
  const { nombre, descripcion, superficie_ha, activo, geom } = req.body ?? {};
  const id_estancia = req.estancia.id_estancia;

  if (!nombre) {
    return res.status(400).json({ error: 'nombre es obligatorio.' });
  }
  if (!geom) {
    return res.status(400).json({ error: 'geom es obligatorio.' });
  }

  let normalizedGeom;
  try {
    normalizedGeom = validateAndNormalizePolygon(geom);
    await assertValidPolygon(normalizedGeom);
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

  const potrero = await potreroRepository.createPotrero({ id_estancia, nombre, descripcion, superficie_ha, activo });
  await setPotreroGeom(potrero.id_potrero, normalizedGeom);
  potrero.geom = normalizedGeom;

  return res.status(201).json(potrero);
}

// #13
async function listByEstancia(req, res) {
  const potreros = await potreroRepository.getPotrerosByEstancia(req.estancia.id_estancia);
  return res.json(potreros);
}

// #14: requirePotreroOwnership ya validó pertenencia.
async function getById(req, res) {
  const potrero = await potreroRepository.getPotreroById(req.potrero.id_potrero);
  return res.json(potrero);
}

// #15
async function update(req, res) {
  const { nombre, descripcion, superficie_ha, activo, geom } = req.body ?? {};
  const id_potrero = req.potrero.id_potrero;
  const id_estancia = req.potrero.id_estancia;

  let normalizedGeom;
  if (geom !== undefined) {
    try {
      normalizedGeom = validateAndNormalizePolygon(geom);
      await assertValidPolygon(normalizedGeom);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    const inside = await isPolygonWithinEstancia(id_estancia, normalizedGeom);
    if (!inside) {
      return res.status(400).json({ error: 'El potrero debe quedar dentro de la estancia asociada.' });
    }
    const overlaps = await hasPotreroOverlap(id_estancia, normalizedGeom, id_potrero);
    if (overlaps) {
      return res.status(400).json({ error: 'El potrero se solapa con otro potrero de la misma estancia.' });
    }
  }

  const fields = {};
  if (nombre !== undefined) fields.nombre = nombre;
  if (descripcion !== undefined) fields.descripcion = descripcion;
  if (superficie_ha !== undefined) fields.superficie_ha = superficie_ha;
  if (activo !== undefined) fields.activo = activo;

  const potrero = await potreroRepository.updatePotrero(id_potrero, fields);
  if (normalizedGeom) {
    await setPotreroGeom(id_potrero, normalizedGeom);
    potrero.geom = normalizedGeom;
  }
  return res.json(potrero);
}

// #16: el ganado asignado al potrero queda sin potrero (se cierra la
// asignación, no se elimina el animal ni su historial). Reemplaza al
// comportamiento viejo de "desvincular rodeos".
//
// Es una baja lógica (potrero.activo = false), no un DELETE físico: el
// historial de asignacion_ganado conserva filas cerradas que siguen
// referenciando el potrero (RESTRICT), y borrarlo en cascada destruiría
// el historial de estimaciones/disponibilidad/recomendaciones, violando
// RNF010 ("cada estimación... debe resultar auditable a posteriori").
async function remove(req, res) {
  const id_potrero = req.potrero.id_potrero;
  const asignacionesActivas = await asignacionGanadoRepository.getAsignacionesActivasByPotrero(id_potrero);

  if (asignacionesActivas.length > 0 && req.query.confirm !== 'true') {
    return res.status(409).json({
      requiresConfirmation: true,
      message:
        `Este potrero tiene ${asignacionesActivas.length} animal(es) asignado(s). Al eliminarlo, ` +
        'quedarán sin potrero. Reenvíe la solicitud con ?confirm=true para continuar.',
      animalesAfectados: asignacionesActivas.length,
    });
  }

  await sequelize.transaction(async (t) => {
    const hoy = new Date().toISOString().slice(0, 10);
    await asignacionGanadoRepository.cerrarAsignacionesActivasDePotrero(id_potrero, hoy, 'FINALIZADA', t);
    await potreroRepository.updatePotrero(id_potrero, { activo: false }, t);
  });

  return res.json({ deleted: true, animalesDesvinculados: asignacionesActivas.length });
}

async function isPolygonWithinEstancia(idEstancia, polygon) {
  const [row] = await sequelize.query(
    `SELECT ST_Within(ST_GeomFromGeoJSON(:geojson, 1, 4326), geom) AS inside
     FROM \`estancia\` WHERE id_estancia = :id`,
    { replacements: { geojson: JSON.stringify(polygon), id: idEstancia }, type: QueryTypes.SELECT }
  );
  return Boolean(row?.inside);
}

async function hasPotreroOverlap(idEstancia, polygon, excludePotreroId = null) {
  const excludeClause = excludePotreroId ? 'AND id_potrero != :excludeId' : '';
  const [row] = await sequelize.query(
    `SELECT COUNT(*) AS total
     FROM \`potrero\`
     WHERE id_estancia = :idEstancia
       AND geom IS NOT NULL
       ${excludeClause}
       AND ST_Intersects(geom, ST_GeomFromGeoJSON(:geojson, 1, 4326))`,
    {
      replacements: { idEstancia, geojson: JSON.stringify(polygon), excludeId: excludePotreroId },
      type: QueryTypes.SELECT,
    }
  );
  return Number(row.total) > 0;
}

module.exports = { create, listByEstancia, getById, update, remove };
