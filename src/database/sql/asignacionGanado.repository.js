'use strict';

const { QueryTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const SELECT_FIELDS =
  'id_asignacion, id_ganado, id_potrero, fecha_desde, fecha_hasta, estado, created_at, updated_at';

async function getAsignacionById(id, transaction) {
  const rows = await sequelize.query(`SELECT ${SELECT_FIELDS} FROM \`asignacion_ganado\` WHERE id_asignacion = :id`, {
    replacements: { id },
    type: QueryTypes.SELECT,
    transaction,
  });
  return rows[0] ?? null;
}

// NULL = vigente (ver migración 20260801000004). A lo sumo una fila por
// animal por el índice único de la base.
async function getAsignacionActivaByGanado(id_ganado, transaction) {
  const rows = await sequelize.query(
    `SELECT ${SELECT_FIELDS} FROM \`asignacion_ganado\` WHERE id_ganado = :id_ganado AND fecha_hasta IS NULL`,
    { replacements: { id_ganado }, type: QueryTypes.SELECT, transaction }
  );
  return rows[0] ?? null;
}

async function getAsignacionesActivasByPotrero(id_potrero, transaction) {
  return sequelize.query(
    `SELECT ${SELECT_FIELDS} FROM \`asignacion_ganado\` WHERE id_potrero = :id_potrero AND fecha_hasta IS NULL`,
    { replacements: { id_potrero }, type: QueryTypes.SELECT, transaction }
  );
}

async function getHistorialByEstancia(id_estancia) {
  return sequelize.query(
    `SELECT a.id_asignacion, a.id_ganado, a.id_potrero, a.fecha_desde, a.fecha_hasta,
            a.estado, a.created_at, a.updated_at
     FROM \`asignacion_ganado\` a
     JOIN \`ganado\` g ON g.id_ganado = a.id_ganado
     WHERE g.id_estancia = :id_estancia
     ORDER BY a.fecha_desde DESC, a.id_asignacion DESC`,
    { replacements: { id_estancia }, type: QueryTypes.SELECT }
  );
}

async function crearAsignacion({ id_ganado, id_potrero, fecha_desde, estado }, transaction) {
  const [insertId] = await sequelize.query(
    `INSERT INTO \`asignacion_ganado\` (id_ganado, id_potrero, fecha_desde, estado, created_at, updated_at)
     VALUES (:id_ganado, :id_potrero, :fecha_desde, :estado, NOW(), NOW())`,
    {
      replacements: { id_ganado, id_potrero, fecha_desde, estado },
      type: QueryTypes.INSERT,
      transaction,
    }
  );
  return getAsignacionById(insertId, transaction);
}

async function cerrarAsignacion(id_asignacion, fecha_hasta, estado, transaction) {
  await sequelize.query(
    `UPDATE \`asignacion_ganado\` SET fecha_hasta = :fecha_hasta, estado = :estado, updated_at = NOW()
     WHERE id_asignacion = :id_asignacion`,
    { replacements: { id_asignacion, fecha_hasta, estado }, type: QueryTypes.UPDATE, transaction }
  );
}

// Usado al eliminar un potrero: el ganado que tenía asignado queda sin
// potrero (cierra la asignación) en lugar de eliminar el historial.
async function cerrarAsignacionesActivasDePotrero(id_potrero, fecha_hasta, estado, transaction) {
  await sequelize.query(
    `UPDATE \`asignacion_ganado\` SET fecha_hasta = :fecha_hasta, estado = :estado, updated_at = NOW()
     WHERE id_potrero = :id_potrero AND fecha_hasta IS NULL`,
    { replacements: { id_potrero, fecha_hasta, estado }, type: QueryTypes.UPDATE, transaction }
  );
}

module.exports = {
  getAsignacionById,
  getAsignacionActivaByGanado,
  getAsignacionesActivasByPotrero,
  getHistorialByEstancia,
  crearAsignacion,
  cerrarAsignacion,
  cerrarAsignacionesActivasDePotrero,
};
