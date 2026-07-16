'use strict';

const ganadoRepository = require('../database/sql/ganado.repository');
const rodeoRepository = require('../database/sql/rodeo.repository');
const { isDuplicateEntryError } = require('../utils/dbErrors');

const UPDATABLE_FIELDS = [
  'numero_identificacion',
  'fecha_nacimiento',
  'sexo',
  'categoria',
  'peso_kg',
  'estado',
  'observaciones',
];

async function create(req, res) {
  const {
    id_rodeo,
    numero_identificacion,
    fecha_nacimiento,
    sexo,
    categoria,
    peso_kg,
    estado,
    observaciones,
  } = req.body;

  if (!id_rodeo || !numero_identificacion || !sexo || !categoria) {
    return res.status(400).json({
      error: 'id_rodeo, numero_identificacion, sexo y categoria son obligatorios.',
    });
  }

  const rodeo = await rodeoRepository.getRodeoById(id_rodeo);
  if (!rodeo) {
    return res.status(400).json({ error: 'El rodeo indicado no existe.' });
  }

  try {
    const ganado = await ganadoRepository.createGanado({
      id_rodeo,
      numero_identificacion,
      fecha_nacimiento,
      sexo,
      categoria,
      peso_kg,
      estado,
      observaciones,
    });
    return res.status(201).json(ganado);
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      return res.status(409).json({ error: 'Ya existe un animal con ese numero_identificacion.' });
    }
    return res.status(500).json({ error: 'Error al crear el animal.' });
  }
}

async function getById(req, res) {
  const ganado = await ganadoRepository.getGanadoById(req.params.id);
  if (!ganado) {
    return res.status(404).json({ error: 'Animal no encontrado.' });
  }
  return res.json(ganado);
}

async function update(req, res) {
  const existing = await ganadoRepository.getGanadoById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Animal no encontrado.' });
  }

  const fields = UPDATABLE_FIELDS.reduce((acc, key) => {
    if (req.body[key] !== undefined) acc[key] = req.body[key];
    return acc;
  }, {});

  if (Object.keys(fields).length === 0) {
    return res.status(400).json({ error: 'No hay campos para actualizar.' });
  }

  try {
    const ganado = await ganadoRepository.updateGanado(req.params.id, fields);
    return res.json(ganado);
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      return res.status(409).json({ error: 'Ya existe un animal con ese numero_identificacion.' });
    }
    return res.status(500).json({ error: 'Error al actualizar el animal.' });
  }
}

async function updateRodeo(req, res) {
  const existing = await ganadoRepository.getGanadoById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Animal no encontrado.' });
  }

  const { id_rodeo } = req.body;
  if (!id_rodeo) {
    return res.status(400).json({ error: 'id_rodeo es obligatorio.' });
  }

  const [rodeoDestino, rodeoActual] = await Promise.all([
    rodeoRepository.getRodeoById(id_rodeo),
    rodeoRepository.getRodeoById(existing.id_rodeo),
  ]);

  if (!rodeoDestino) {
    return res.status(400).json({ error: 'El rodeo destino no existe.' });
  }
  if (rodeoDestino.id_estancia !== rodeoActual.id_estancia) {
    return res.status(400).json({
      error: 'No se puede transferir el animal a un rodeo de otra estancia.',
    });
  }

  const ganado = await ganadoRepository.updateGanadoRodeo(req.params.id, id_rodeo);
  return res.json(ganado);
}

module.exports = { create, getById, update, updateRodeo };
