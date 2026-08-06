'use strict';

const empleadoRepository = require('../database/sql/empleado.repository');

function validarCamposEmpleado(body) {
  const { nombre, rol } = body ?? {};
  if (!nombre || !rol) {
    return 'nombre y rol son obligatorios.';
  }
  return null;
}

async function create(req, res) {
  const errorValidacion = validarCamposEmpleado(req.body);
  if (errorValidacion) {
    return res.status(400).json({ error: errorValidacion });
  }

  const { nombre, rol, telefono } = req.body;
  const empleado = await empleadoRepository.createEmpleado({
    id_estancia: req.estancia.id_estancia,
    nombre,
    rol,
    telefono,
  });
  return res.status(201).json(empleado);
}

async function listByEstancia(req, res) {
  const empleados = await empleadoRepository.getEmpleadosByEstancia(req.estancia.id_estancia);
  return res.json(empleados);
}

// requireEmpleadoOwnership ya validó pertenencia.
async function getById(req, res) {
  const empleado = await empleadoRepository.getEmpleadoById(req.empleado.id_empleado);
  return res.json(empleado);
}

async function update(req, res) {
  const fields = {};
  for (const key of ['nombre', 'rol', 'telefono']) {
    if (req.body?.[key] !== undefined) fields[key] = req.body[key];
  }
  if (Object.keys(fields).length === 0) {
    return res.status(400).json({ error: 'No hay campos para actualizar.' });
  }

  const empleado = await empleadoRepository.updateEmpleado(req.empleado.id_empleado, fields);
  return res.json(empleado);
}

// Baja lógica: activo = false, no borra la fila.
async function remove(req, res) {
  await empleadoRepository.darDeBaja(req.empleado.id_empleado);
  return res.json({ deleted: true });
}

module.exports = { create, listByEstancia, getById, update, remove };
