'use strict';

const { QueryTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

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

const BASE_SELECT = `
  ganado.id_ganado, ganado.id_estancia, ganado.numero_identificacion,
  ganado.fecha_nacimiento, ganado.sexo, ganado.categoria, ganado.peso_kg,
  ganado.condicion_corporal, ganado.estado_fisiologico, ganado.observaciones,
  ganado.activo, ganado.created_at, ganado.updated_at,
  asignacion_activa.id_potrero AS id_potrero_actual,
  potrero_actual.nombre AS potrero_actual_nombre
`;

// El potrero actual se resuelve por la asignación vigente (fecha_hasta
// NULL), no por una FK directa en ganado: puede no tener ninguna.
const CURRENT_POTRERO_JOIN = `
  LEFT JOIN \`asignacion_ganado\` asignacion_activa
    ON asignacion_activa.id_ganado = ganado.id_ganado AND asignacion_activa.fecha_hasta IS NULL
  LEFT JOIN \`potrero\` potrero_actual
    ON potrero_actual.id_potrero = asignacion_activa.id_potrero
`;

async function createGanado(
  {
    id_estancia,
    numero_identificacion,
    fecha_nacimiento,
    sexo,
    categoria,
    peso_kg,
    condicion_corporal,
    estado_fisiologico,
    observaciones,
  },
  transaction
) {
  const [insertId] = await sequelize.query(
    `INSERT INTO \`ganado\`
       (id_estancia, numero_identificacion, fecha_nacimiento, sexo, categoria, peso_kg,
        condicion_corporal, estado_fisiologico, observaciones, activo, created_at, updated_at)
     VALUES
       (:id_estancia, :numero_identificacion, :fecha_nacimiento, :sexo, :categoria, :peso_kg,
        :condicion_corporal, :estado_fisiologico, :observaciones, TRUE, NOW(), NOW())`,
    {
      replacements: {
        id_estancia,
        numero_identificacion,
        fecha_nacimiento: fecha_nacimiento ?? null,
        sexo,
        categoria,
        peso_kg: peso_kg ?? null,
        condicion_corporal: condicion_corporal ?? null,
        estado_fisiologico: estado_fisiologico ?? null,
        observaciones: observaciones ?? null,
      },
      type: QueryTypes.INSERT,
      transaction,
    }
  );
  return getGanadoById(insertId, transaction);
}

async function getGanadoById(id, transaction) {
  const rows = await sequelize.query(
    `SELECT ${BASE_SELECT} FROM \`ganado\` ${CURRENT_POTRERO_JOIN} WHERE ganado.id_ganado = :id`,
    { replacements: { id }, type: QueryTypes.SELECT, transaction }
  );
  return rows[0] ?? null;
}

// #19: todo el ganado activo de la estancia (la baja lógica lo excluye).
async function getGanadoByEstancia(id_estancia) {
  return sequelize.query(
    `SELECT ${BASE_SELECT} FROM \`ganado\` ${CURRENT_POTRERO_JOIN}
     WHERE ganado.id_estancia = :id_estancia AND ganado.activo = TRUE
     ORDER BY ganado.numero_identificacion`,
    { replacements: { id_estancia }, type: QueryTypes.SELECT }
  );
}

// #22: sólo el ganado con asignación vigente en ese potrero.
async function getGanadoByPotrero(id_potrero) {
  return sequelize.query(
    `SELECT ${BASE_SELECT} FROM \`ganado\`
     JOIN \`asignacion_ganado\` asignacion_activa
       ON asignacion_activa.id_ganado = ganado.id_ganado AND asignacion_activa.fecha_hasta IS NULL
     JOIN \`potrero\` potrero_actual ON potrero_actual.id_potrero = asignacion_activa.id_potrero
     WHERE asignacion_activa.id_potrero = :id_potrero AND ganado.activo = TRUE
     ORDER BY ganado.numero_identificacion`,
    { replacements: { id_potrero }, type: QueryTypes.SELECT }
  );
}

async function updateGanado(id, fields) {
  const keys = UPDATABLE_FIELDS.filter((key) => fields[key] !== undefined);
  if (keys.length > 0) {
    const setClause = keys.map((key) => `\`${key}\` = :${key}`).join(', ');
    const replacements = keys.reduce((acc, key) => ({ ...acc, [key]: fields[key] }), { id });
    await sequelize.query(`UPDATE \`ganado\` SET ${setClause}, updated_at = NOW() WHERE id_ganado = :id`, {
      replacements,
      type: QueryTypes.UPDATE,
    });
  }
  return getGanadoById(id);
}

// #21: baja lógica (docs/backend-gap-analysis.md §5.3). No borra el
// historial de asignaciones; el llamador es responsable de cerrar la
// asignación activa, si tiene una, dentro de la misma transacción.
async function darDeBaja(id, transaction) {
  await sequelize.query('UPDATE `ganado` SET activo = FALSE, updated_at = NOW() WHERE id_ganado = :id', {
    replacements: { id },
    type: QueryTypes.UPDATE,
    transaction,
  });
}

module.exports = {
  createGanado,
  getGanadoById,
  getGanadoByEstancia,
  getGanadoByPotrero,
  updateGanado,
  darDeBaja,
};
