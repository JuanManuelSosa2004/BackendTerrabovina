'use strict';

const estanciaRepository = require('../database/sql/estancia.repository');
const potreroRepository = require('../database/sql/potrero.repository');
const ganadoRepository = require('../database/sql/ganado.repository');
const asignacionGanadoRepository = require('../database/sql/asignacionGanado.repository');
const { setEstanciaGeom, assertValidPolygon } = require('../database/sql/geometry.repository');
const { validateAndNormalizePolygon } = require('../database/sql/geometryValidation');
const { sequelize } = require('../database/sequelize');
const { QueryTypes } = require('sequelize');

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

  // Unicidad "a lo sumo una estancia activa por usuario": ya no la
  // garantiza un índice único de base (migración 20260801000017 lo quita
  // porque MySQL no soporta únicos parciales y una baja lógica debe poder
  // ir seguida de una estancia nueva), se valida acá.
  const existente = await estanciaRepository.getEstanciaByUsuario(req.usuario.id_usuario);
  if (existente) {
    return res.status(409).json({ error: 'El usuario ya tiene una estancia asociada.' });
  }

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

// CA001: dar de baja la estancia da de baja en cascada sus potreros y su
// ganado (baja lógica, no DELETE físico — migración 20260801000017, mismo
// patrón que Potrero/Ganado), previa confirmación explícita
// (?confirm=true). No se toca asignacion_ganado más allá de cerrar lo que
// esté vigente, ni traslado_ganado/traslado_ganado_detalle: quedan
// intactos como historial consultable, igual que al dar de baja un
// potrero o un animal individualmente.
async function remove(req, res) {
  const id_estancia = req.estancia.id_estancia;
  const [potreros, ganado] = await Promise.all([
    potreroRepository.getPotrerosByEstancia(id_estancia),
    ganadoRepository.getGanadoByEstancia(id_estancia),
  ]);
  const potrerosActivos = potreros.filter((p) => p.activo);

  if ((potrerosActivos.length > 0 || ganado.length > 0) && req.query.confirm !== 'true') {
    return res.status(409).json({
      requiresConfirmation: true,
      message:
        `Esta estancia tiene ${potrerosActivos.length} potrero(s) y ${ganado.length} animal(es) asociados. ` +
        'Se darán de baja junto con ella. Reenvíe la solicitud con ?confirm=true para continuar.',
      potrerosAfectados: potrerosActivos.length,
      ganadoAfectado: ganado.length,
    });
  }

  await sequelize.transaction(async (t) => {
    const potreroIds = potrerosActivos.map((p) => p.id_potrero);
    const hoy = new Date().toISOString().slice(0, 10);

    await asignacionGanadoRepository.cerrarAsignacionesActivasDePotreros(potreroIds, hoy, 'FINALIZADA', t);
    await ganadoRepository.darDeBajaTodosDeEstancia(id_estancia, t);
    await potreroRepository.darDeBajaTodosDeEstancia(id_estancia, t);
    await estanciaRepository.darDeBajaEstancia(id_estancia, t);
  });

  return res.json({ deleted: true, potrerosEliminados: potrerosActivos.length, ganadoEliminado: ganado.length });
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
