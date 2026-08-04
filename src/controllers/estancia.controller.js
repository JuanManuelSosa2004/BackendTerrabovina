'use strict';

const estanciaRepository = require('../database/sql/estancia.repository');
const potreroRepository = require('../database/sql/potrero.repository');
const ganadoRepository = require('../database/sql/ganado.repository');
const { setEstanciaGeom, assertValidPolygon } = require('../database/sql/geometry.repository');
const { validateAndNormalizePolygon } = require('../database/sql/geometryValidation');
const { sequelize } = require('../database/sequelize');
const { QueryTypes } = require('sequelize');
const { isDuplicateEntryError } = require('../utils/dbErrors');

// RF001 / CA002: el polígono es obligatorio al registrar la estancia (a
// diferencia del código viejo, la V2 no tiene un endpoint .../geometria
// separado: la geometría viaja en el propio recurso).
async function create(req, res) {
  const { nombre, departamento, provincia, superficie_total_ha, geom } = req.body ?? {};
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

  try {
    // RNF007: la estancia se asocia siempre al usuario autenticado, nunca
    // a un id_usuario recibido del cliente.
    const estancia = await estanciaRepository.createEstancia({
      id_usuario: req.usuario.id_usuario,
      nombre,
      departamento,
      provincia,
      superficie_total_ha,
    });
    await setEstanciaGeom(estancia.id_estancia, normalizedGeom);
    estancia.geom = normalizedGeom;
    return res.status(201).json(estancia);
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      return res.status(409).json({ error: 'El usuario ya tiene una estancia asociada.' });
    }
    throw error;
  }
}

// #8: la estancia del usuario autenticado.
async function getMine(req, res) {
  const estancia = await estanciaRepository.getEstanciaByUsuario(req.usuario.id_usuario);
  if (!estancia) {
    return res.status(404).json({ error: 'El usuario no tiene una estancia registrada.' });
  }
  return res.json(estancia);
}

// #9: requireEstanciaOwnership ya validó pertenencia y cargó req.estancia.
async function getById(req, res) {
  const estancia = await estanciaRepository.getEstanciaById(req.estancia.id_estancia);
  return res.json(estancia);
}

async function update(req, res) {
  const { nombre, departamento, provincia, superficie_total_ha, geom } = req.body ?? {};

  let normalizedGeom;
  if (geom !== undefined) {
    try {
      normalizedGeom = validateAndNormalizePolygon(geom);
      await assertValidPolygon(normalizedGeom);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    const potrerosFuera = await getPotrerosFueraDeGeom(req.estancia.id_estancia, normalizedGeom);
    if (potrerosFuera.length > 0) {
      return res.status(400).json({
        error: 'El nuevo polígono de la estancia debe contener a todos sus potreros existentes.',
        potrerosAfectados: potrerosFuera,
      });
    }
  }

  const fields = {};
  if (nombre !== undefined) fields.nombre = nombre;
  if (departamento !== undefined) fields.departamento = departamento;
  if (provincia !== undefined) fields.provincia = provincia;
  if (superficie_total_ha !== undefined) fields.superficie_total_ha = superficie_total_ha;

  const estancia = await estanciaRepository.updateEstancia(req.estancia.id_estancia, fields);
  if (normalizedGeom) {
    await setEstanciaGeom(req.estancia.id_estancia, normalizedGeom);
    estancia.geom = normalizedGeom;
  }
  return res.json(estancia);
}

// CA001: eliminar la estancia elimina en cascada sus potreros y su
// ganado, previa confirmación explícita (?confirm=true).
async function remove(req, res) {
  const id_estancia = req.estancia.id_estancia;
  const [potreros, ganado] = await Promise.all([
    potreroRepository.getPotrerosByEstancia(id_estancia),
    ganadoRepository.getGanadoByEstancia(id_estancia),
  ]);

  if ((potreros.length > 0 || ganado.length > 0) && req.query.confirm !== 'true') {
    return res.status(409).json({
      requiresConfirmation: true,
      message:
        `Esta estancia tiene ${potreros.length} potrero(s) y ${ganado.length} animal(es) asociados. ` +
        'Se eliminarán junto con ella. Reenvíe la solicitud con ?confirm=true para continuar.',
      potrerosAfectados: potreros.length,
      ganadoAfectado: ganado.length,
    });
  }

  await sequelize.transaction(async (t) => {
    const potreroIds = potreros.map((p) => p.id_potrero);
    if (potreroIds.length > 0) {
      await sequelize.query(
        'DELETE FROM `recomendacion` WHERE id_potrero IN (:ids)',
        { replacements: { ids: potreroIds }, type: QueryTypes.DELETE, transaction: t }
      );
      await sequelize.query(
        'DELETE FROM `asignacion_ganado` WHERE id_potrero IN (:ids)',
        { replacements: { ids: potreroIds }, type: QueryTypes.DELETE, transaction: t }
      );
    }
    await sequelize.query('DELETE FROM `ganado` WHERE id_estancia = :id', {
      replacements: { id: id_estancia },
      type: QueryTypes.DELETE,
      transaction: t,
    });
    // Al borrar los potreros, MySQL hace CASCADE sobre observacion_satelital,
    // dato_climatico, disponibilidad_forrajera y estimacion_demanda (ver
    // migraciones); recomendacion ya se vació arriba a mano porque su FK es
    // RESTRICT.
    await sequelize.query('DELETE FROM `potrero` WHERE id_estancia = :id', {
      replacements: { id: id_estancia },
      type: QueryTypes.DELETE,
      transaction: t,
    });
    await estanciaRepository.deleteEstancia(id_estancia, t);
  });

  return res.json({ deleted: true, potrerosEliminados: potreros.length, ganadoEliminado: ganado.length });
}

// Potreros cuya geometría quedaría fuera del nuevo polígono de la estancia
// (mismo criterio ST_Within que usa potrero.controller.js al crear/mover un
// potrero, aplicado acá en el sentido inverso).
async function getPotrerosFueraDeGeom(idEstancia, polygon) {
  const rows = await sequelize.query(
    `SELECT id_potrero, nombre
     FROM \`potrero\`
     WHERE id_estancia = :idEstancia
       AND geom IS NOT NULL
       AND NOT ST_Within(geom, ST_GeomFromGeoJSON(:geojson, 1, 4326))`,
    { replacements: { idEstancia, geojson: JSON.stringify(polygon) }, type: QueryTypes.SELECT }
  );
  return rows;
}

module.exports = { create, getMine, getById, update, remove };
