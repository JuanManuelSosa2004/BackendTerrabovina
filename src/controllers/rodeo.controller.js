'use strict';

const rodeoRepository = require('../database/sql/rodeo.repository');
const ganadoRepository = require('../database/sql/ganado.repository');
const potreroRepository = require('../database/sql/potrero.repository');

const UPDATABLE_FIELDS = ['nombre', 'descripcion', 'activo'];
//VERIFICATION
async function assertPotreroBelongsToEstancia(idPotrero, idEstancia) {
  const potrero = await potreroRepository.getPotreroById(idPotrero);
  if (!potrero) {
    return 'El potrero indicado no existe.';
  }
  if (potrero.id_estancia !== Number(idEstancia)) {
    return 'El potrero indicado no pertenece a la estancia del rodeo.';
  }
  return null;
}
//CREATE
async function create(req, res) {
  const { id_estancia, id_potrero_actual, nombre, descripcion, activo } = req.body;
  if (!id_estancia || !nombre) {
    return res.status(400).json({ error: 'id_estancia y nombre son obligatorios.' });
  }

  if (id_potrero_actual !== undefined && id_potrero_actual !== null) {
    const error = await assertPotreroBelongsToEstancia(id_potrero_actual, id_estancia);
    if (error) {
      return res.status(400).json({ error });
    }
  }

  try {
    const rodeo = await rodeoRepository.createRodeo({
      id_estancia,
      id_potrero_actual,
      nombre,
      descripcion,
      activo,
    });
    return res.status(201).json(rodeo);
  } catch (error) {
    return res.status(500).json({ error: 'Error al crear el rodeo.' });
  }
}
//GET
async function getById(req, res) {
  const rodeo = await rodeoRepository.getRodeoById(req.params.id);
  if (!rodeo) {
    return res.status(404).json({ error: 'Rodeo no encontrado.' });
  }
  return res.json(rodeo);
}
//VERIFICATION FOR UPDATE
async function update(req, res) {
  const existing = await rodeoRepository.getRodeoById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Rodeo no encontrado.' });
  }

  const fields = UPDATABLE_FIELDS.reduce((acc, key) => {
    if (req.body[key] !== undefined) acc[key] = req.body[key];
    return acc;
  }, {});

  if (Object.keys(fields).length === 0) {
    return res.status(400).json({ error: 'No hay campos para actualizar.' });
  }

  const rodeo = await rodeoRepository.updateRodeo(req.params.id, fields);
  return res.json(rodeo);
}
//UPDATE
async function updatePotrero(req, res) {
  const existing = await rodeoRepository.getRodeoById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Rodeo no encontrado.' });
  }

  const { id_potrero_actual } = req.body;
  if (id_potrero_actual !== null && id_potrero_actual !== undefined) {
    const error = await assertPotreroBelongsToEstancia(id_potrero_actual, existing.id_estancia);
    if (error) {
      return res.status(400).json({ error });
    }
  }

  const rodeo = await rodeoRepository.updateRodeoPotrero(req.params.id, id_potrero_actual ?? null);
  return res.json(rodeo);
}
//GETALLGANADO
async function listGanado(req, res) {
  const existing = await rodeoRepository.getRodeoById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Rodeo no encontrado.' });
  }
  const ganado = await ganadoRepository.getGanadoByRodeo(req.params.id);
  return res.json(ganado);
}

module.exports = { create, getById, update, updatePotrero, listGanado };
