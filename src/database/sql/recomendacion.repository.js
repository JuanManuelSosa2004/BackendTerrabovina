'use strict';

const { QueryTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const SELECT_FIELDS =
  'id_recomendacion, id_potrero, id_estimacion_demanda, id_disponibilidad, fecha_generacion, tipo, descripcion, prioridad, fundamento, estado, created_at, updated_at';

async function getRecomendacionById(id, transaction) {
  const rows = await sequelize.query(`SELECT ${SELECT_FIELDS} FROM \`recomendacion\` WHERE id_recomendacion = :id`, {
    replacements: { id },
    type: QueryTypes.SELECT,
    transaction,
  });
  return rows[0] ?? null;
}

async function getRecomendacionesByPotrero(id_potrero, { estado, vigente, desde, hasta } = {}) {
  const conditions = ['id_potrero = :id_potrero'];
  const replacements = { id_potrero };

  if (estado) {
    conditions.push('estado = :estado');
    replacements.estado = estado;
  }
  if (vigente === true) {
    conditions.push("estado = 'PENDIENTE'");
  }
  if (desde) {
    conditions.push('fecha_generacion >= :desde');
    replacements.desde = desde;
  }
  if (hasta) {
    conditions.push('fecha_generacion <= :hasta');
    replacements.hasta = hasta;
  }

  return sequelize.query(
    `SELECT ${SELECT_FIELDS} FROM \`recomendacion\`
     WHERE ${conditions.join(' AND ')}
     ORDER BY fecha_generacion DESC`,
    { replacements, type: QueryTypes.SELECT }
  );
}

async function crearRecomendacion(
  { id_potrero, id_estimacion_demanda, id_disponibilidad, fecha_generacion, tipo, descripcion, prioridad, fundamento },
  transaction
) {
  const [insertId] = await sequelize.query(
    `INSERT INTO \`recomendacion\`
       (id_potrero, id_estimacion_demanda, id_disponibilidad, fecha_generacion, tipo, descripcion,
        prioridad, fundamento, estado, created_at, updated_at)
     VALUES
       (:id_potrero, :id_estimacion_demanda, :id_disponibilidad, :fecha_generacion, :tipo, :descripcion,
        :prioridad, :fundamento, 'PENDIENTE', NOW(), NOW())`,
    {
      replacements: {
        id_potrero,
        id_estimacion_demanda,
        id_disponibilidad,
        fecha_generacion,
        tipo,
        descripcion: descripcion ?? null,
        prioridad: prioridad ?? null,
        fundamento: fundamento ?? null,
      },
      type: QueryTypes.INSERT,
      transaction,
    }
  );
  return getRecomendacionById(insertId, transaction);
}

async function actualizarEstado(id, estado) {
  await sequelize.query('UPDATE `recomendacion` SET estado = :estado, updated_at = NOW() WHERE id_recomendacion = :id', {
    replacements: { id, estado },
    type: QueryTypes.UPDATE,
  });
  return getRecomendacionById(id);
}

module.exports = {
  getRecomendacionById,
  getRecomendacionesByPotrero,
  crearRecomendacion,
  actualizarEstado,
};
