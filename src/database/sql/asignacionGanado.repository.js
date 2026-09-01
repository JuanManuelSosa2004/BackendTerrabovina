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

// Filtros comunes a los tres históricos (por estancia, por potrero, por
// animal): vigente=true/false acota a fecha_hasta NULL/no NULL,
// desde/hasta acotan fecha_desde. `vigente` ya viaja como boolean o
// undefined (el controller parsea el query string).
function buildFiltrosHistorial({ id_potrero, id_ganado, vigente, desde, hasta }, replacements) {
  const conditions = [];
  if (id_potrero) {
    conditions.push('a.id_potrero = :id_potrero');
    replacements.id_potrero = id_potrero;
  }
  if (id_ganado) {
    conditions.push('a.id_ganado = :id_ganado');
    replacements.id_ganado = id_ganado;
  }
  if (vigente === true) {
    conditions.push('a.fecha_hasta IS NULL');
  } else if (vigente === false) {
    conditions.push('a.fecha_hasta IS NOT NULL');
  }
  if (desde) {
    conditions.push('a.fecha_desde >= :desde');
    replacements.desde = desde;
  }
  if (hasta) {
    conditions.push('a.fecha_desde <= :hasta');
    replacements.hasta = hasta;
  }
  return conditions;
}

async function getHistorialByEstancia(id_estancia, filtros = {}) {
  const replacements = { id_estancia };
  const conditions = ['g.id_estancia = :id_estancia', ...buildFiltrosHistorial(filtros, replacements)];

  return sequelize.query(
    `SELECT a.id_asignacion, a.id_ganado, a.id_potrero, a.fecha_desde, a.fecha_hasta,
            a.estado, a.created_at, a.updated_at
     FROM \`asignacion_ganado\` a
     JOIN \`ganado\` g ON g.id_ganado = a.id_ganado
     WHERE ${conditions.join(' AND ')}
     ORDER BY a.fecha_desde DESC, a.id_asignacion DESC`,
    { replacements, type: QueryTypes.SELECT }
  );
}

// Histórico de un potrero puntual: quién pasó por ahí, no sólo quién está
// hoy (eso ya lo resuelve ganado.repository#getGanadoByPotrero).
async function getHistorialByPotrero(id_potrero, filtros = {}) {
  const replacements = { id_potrero };
  const conditions = ['a.id_potrero = :id_potrero', ...buildFiltrosHistorial(filtros, replacements)];

  return sequelize.query(
    `SELECT ${SELECT_FIELDS} FROM \`asignacion_ganado\` a
     WHERE ${conditions.join(' AND ')}
     ORDER BY a.fecha_desde DESC, a.id_asignacion DESC`,
    { replacements, type: QueryTypes.SELECT }
  );
}

/**
 * Asignaciones que SOLAPAN la ventana, no las que empezaron dentro de ella.
 *
 * buildFiltrosHistorial acota `desde`/`hasta` sobre fecha_desde, que es lo
 * correcto para listar "qué asignaciones se abrieron en este período". Para
 * reconstruir el consumo de una ventana hace falta lo otro: un animal que
 * entró hace seis meses y sigue en el potrero no abrió ninguna asignación
 * dentro de la ventana, pero comió todos sus días.
 *
 * La condición de solapamiento es la estándar de intervalos: la asignación
 * empezó antes de que la ventana terminara, y terminó después de que la
 * ventana empezara. fecha_hasta NULL significa vigente, de modo que no cierra
 * y siempre satisface el segundo término.
 */
async function getSolapadasEnVentana(id_potrero, { desde, hasta }) {
  return sequelize.query(
    `SELECT ${SELECT_FIELDS} FROM \`asignacion_ganado\`
     WHERE id_potrero = :id_potrero
       AND fecha_desde <= :hasta
       AND (fecha_hasta IS NULL OR fecha_hasta >= :desde)
     ORDER BY fecha_desde ASC, id_asignacion ASC`,
    { replacements: { id_potrero, desde, hasta }, type: QueryTypes.SELECT }
  );
}

// Histórico completo de un animal a través de todos los potreros por los
// que pasó (complementa a GET /ganado/:id/recorrido, que es la vista
// "traslado a traslado"; esta es la vista "asignación a asignación").
async function getHistorialByGanado(id_ganado, filtros = {}) {
  const replacements = { id_ganado };
  const conditions = ['a.id_ganado = :id_ganado', ...buildFiltrosHistorial(filtros, replacements)];

  return sequelize.query(
    `SELECT ${SELECT_FIELDS} FROM \`asignacion_ganado\` a
     WHERE ${conditions.join(' AND ')}
     ORDER BY a.fecha_desde DESC, a.id_asignacion DESC`,
    { replacements, type: QueryTypes.SELECT }
  );
}

// Cuenta animales distintos que pasaron alguna vez por el potrero (no sólo
// los vigentes): base del secuencial del numero_identificacion automático
// (id_estancia-id_potrero-secuencial, ver ganado.controller#createEnPotrero)
// para no reusar el número de un animal dado de baja (baja lógica, no
// borra esta tabla, ver ganado.repository#darDeBaja).
async function countGanadoHistoricoByPotrero(id_potrero, transaction) {
  const rows = await sequelize.query(
    `SELECT COUNT(DISTINCT id_ganado) AS total FROM \`asignacion_ganado\` WHERE id_potrero = :id_potrero`,
    { replacements: { id_potrero }, type: QueryTypes.SELECT, transaction }
  );
  return Number(rows[0].total);
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

// Variante en lote de cerrarAsignacionesActivasDePotrero, usada al dar de
// baja una estancia entera (estancia.controller#remove): cierra de una
// sola vez las asignaciones activas de todos sus potreros.
async function cerrarAsignacionesActivasDePotreros(ids, fecha_hasta, estado, transaction) {
  if (ids.length === 0) return;
  await sequelize.query(
    `UPDATE \`asignacion_ganado\` SET fecha_hasta = :fecha_hasta, estado = :estado, updated_at = NOW()
     WHERE id_potrero IN (:ids) AND fecha_hasta IS NULL`,
    { replacements: { ids, fecha_hasta, estado }, type: QueryTypes.UPDATE, transaction }
  );
}

module.exports = {
  getAsignacionById,
  getAsignacionActivaByGanado,
  getAsignacionesActivasByPotrero,
  countGanadoHistoricoByPotrero,
  getHistorialByEstancia,
  getHistorialByPotrero,
  getSolapadasEnVentana,
  getHistorialByGanado,
  crearAsignacion,
  cerrarAsignacion,
  cerrarAsignacionesActivasDePotrero,
  cerrarAsignacionesActivasDePotreros,
};
