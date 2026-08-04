'use strict';

const ganadoRepository = require('../database/sql/ganado.repository');
const asignacionGanadoRepository = require('../database/sql/asignacionGanado.repository');
const { sequelize } = require('../database/sequelize');
const { isDuplicateEntryError } = require('../utils/dbErrors');

const UPDATABLE_FIELDS = [
  'numero_identificacion',
  'fecha_nacimiento',
  'sexo',
  'categoria',
  'peso_kg',
  'condicion_corporal',
  'estado_fisiologico',
  'observaciones',
];

// CA011: categoría, peso vivo y número de identificación son obligatorios.
// condicion_corporal es obligatoria sólo para categoria === 'VACA' (única
// categoría relevada de forma sistemática para esa variable, ver
// migración 20260801000001).
function validarCamposGanado(body) {
  const { numero_identificacion, sexo, categoria, peso_kg, condicion_corporal } = body ?? {};
  if (!numero_identificacion || !sexo || !categoria || peso_kg === undefined) {
    return 'numero_identificacion, sexo, categoria y peso_kg son obligatorios.';
  }
  if (categoria === 'VACA' && condicion_corporal === undefined) {
    return 'condicion_corporal es obligatoria para categoria VACA.';
  }
  return null;
}

// #17: crea el animal sin potrero asignado.
async function createEnEstancia(req, res) {
  const errorValidacion = validarCamposGanado(req.body);
  if (errorValidacion) {
    return res.status(400).json({ error: errorValidacion });
  }

  const { numero_identificacion, fecha_nacimiento, sexo, categoria, peso_kg, condicion_corporal, estado_fisiologico, observaciones } =
    req.body;

  try {
    const ganado = await ganadoRepository.createGanado({
      id_estancia: req.estancia.id_estancia,
      numero_identificacion,
      fecha_nacimiento,
      sexo,
      categoria,
      peso_kg,
      condicion_corporal,
      estado_fisiologico,
      observaciones,
    });
    return res.status(201).json(ganado);
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      return res.status(409).json({ error: 'Ya existe un animal con ese numero_identificacion.' });
    }
    throw error;
  }
}

// #18: crea el animal y su primera asignación en la misma transacción
// (docs/backend-gap-analysis.md §3, regla #18); id_estancia se deriva del
// potrero, no se recibe del cliente.
async function createEnPotrero(req, res) {
  const errorValidacion = validarCamposGanado(req.body);
  if (errorValidacion) {
    return res.status(400).json({ error: errorValidacion });
  }

  const { numero_identificacion, fecha_nacimiento, sexo, categoria, peso_kg, condicion_corporal, estado_fisiologico, observaciones } =
    req.body;
  const id_potrero = req.potrero.id_potrero;

  try {
    const ganado = await sequelize.transaction(async (t) => {
      const nuevo = await ganadoRepository.createGanado(
        {
          id_estancia: req.potrero.id_estancia,
          numero_identificacion,
          fecha_nacimiento,
          sexo,
          categoria,
          peso_kg,
          condicion_corporal,
          estado_fisiologico,
          observaciones,
        },
        t
      );
      const hoy = new Date().toISOString().slice(0, 10);
      await asignacionGanadoRepository.crearAsignacion(
        { id_ganado: nuevo.id_ganado, id_potrero, fecha_desde: hoy, estado: 'ACTIVA' },
        t
      );
      return nuevo;
    });
    return res.status(201).json(await ganadoRepository.getGanadoById(ganado.id_ganado));
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      return res.status(409).json({ error: 'Ya existe un animal con ese numero_identificacion.' });
    }
    throw error;
  }
}

// #19
async function listByEstancia(req, res) {
  const ganado = await ganadoRepository.getGanadoByEstancia(req.estancia.id_estancia);
  return res.json(ganado);
}

// #20: requireGanadoOwnership ya validó pertenencia.
async function getById(req, res) {
  const ganado = await ganadoRepository.getGanadoById(req.ganado.id_ganado);
  return res.json(ganado);
}

// No está en los 35 endpoints de la V2, pero sin ella no hay forma de
// actualizar peso ni condición corporal, que son las entradas del modelo
// de estimación de demanda (docs/backend-gap-analysis.md §5.4).
async function update(req, res) {
  const fields = {};
  for (const key of UPDATABLE_FIELDS) {
    if (req.body?.[key] !== undefined) fields[key] = req.body[key];
  }
  if (Object.keys(fields).length === 0) {
    return res.status(400).json({ error: 'No hay campos para actualizar.' });
  }

  try {
    const ganado = await ganadoRepository.updateGanado(req.ganado.id_ganado, fields);
    return res.json(ganado);
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      return res.status(409).json({ error: 'Ya existe un animal con ese numero_identificacion.' });
    }
    throw error;
  }
}

// #21: baja lógica; si el animal tenía una asignación activa, se cierra
// en la misma transacción (docs/backend-gap-analysis.md §5.3).
async function remove(req, res) {
  const id_ganado = req.ganado.id_ganado;

  await sequelize.transaction(async (t) => {
    const asignacionActiva = await asignacionGanadoRepository.getAsignacionActivaByGanado(id_ganado, t);
    if (asignacionActiva) {
      const hoy = new Date().toISOString().slice(0, 10);
      await asignacionGanadoRepository.cerrarAsignacion(asignacionActiva.id_asignacion, hoy, 'FINALIZADA', t);
    }
    await ganadoRepository.darDeBaja(id_ganado, t);
  });

  return res.json({ deleted: true });
}

// #22
async function listByPotrero(req, res) {
  const ganado = await ganadoRepository.getGanadoByPotrero(req.potrero.id_potrero);
  return res.json(ganado);
}

module.exports = { createEnEstancia, createEnPotrero, listByEstancia, getById, update, remove, listByPotrero };
