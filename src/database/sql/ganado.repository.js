'use strict';

const { QueryTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const UPDATABLE_FIELDS = [
  'numero_identificacion',
  'fecha_nacimiento',
  'sexo',
  'categoria',
  'peso_kg',
  'estado',
  'observaciones',
];

async function createGanado({
  id_rodeo,
  numero_identificacion,
  fecha_nacimiento,
  sexo,
  categoria,
  peso_kg,
  estado,
  observaciones,
}) {
  const [insertId] = await sequelize.query(
    `INSERT INTO \`ganado\`
       (id_rodeo, numero_identificacion, fecha_nacimiento, sexo, categoria, peso_kg,
        estado, observaciones, created_at, updated_at)
     VALUES
       (:id_rodeo, :numero_identificacion, :fecha_nacimiento, :sexo, :categoria, :peso_kg,
        :estado, :observaciones, NOW(), NOW())`,
    {
      replacements: {
        id_rodeo,
        numero_identificacion,
        fecha_nacimiento: fecha_nacimiento ?? null,
        sexo,
        categoria,
        peso_kg: peso_kg ?? null,
        estado: estado === undefined ? 'ACTIVO' : estado,
        observaciones: observaciones ?? null,
      },
      type: QueryTypes.INSERT,
    }
  );
  return getGanadoById(insertId);
}

async function getGanadoById(id) {
  const rows = await sequelize.query(
    `SELECT id_ganado, id_rodeo, numero_identificacion, fecha_nacimiento, sexo, categoria,
            peso_kg, estado, observaciones, created_at, updated_at
     FROM \`ganado\`
     WHERE id_ganado = :id`,
    { replacements: { id }, type: QueryTypes.SELECT }
  );
  return rows.length === 0 ? null : rows[0];
}

async function getGanadoByRodeo(idRodeo) {
  return sequelize.query(
    `SELECT id_ganado, id_rodeo, numero_identificacion, fecha_nacimiento, sexo, categoria,
            peso_kg, estado, observaciones, created_at, updated_at
     FROM \`ganado\`
     WHERE id_rodeo = :idRodeo
     ORDER BY numero_identificacion`,
    { replacements: { idRodeo }, type: QueryTypes.SELECT }
  );
}

async function updateGanado(id, fields) {
  const keys = UPDATABLE_FIELDS.filter((key) => fields[key] !== undefined);
  if (keys.length > 0) {
    const setClause = keys.map((key) => `\`${key}\` = :${key}`).join(', ');
    const replacements = keys.reduce((acc, key) => ({ ...acc, [key]: fields[key] }), { id });
    await sequelize.query(
      `UPDATE \`ganado\` SET ${setClause}, updated_at = NOW() WHERE id_ganado = :id`,
      { replacements, type: QueryTypes.UPDATE }
    );
  }
  return getGanadoById(id);
}

async function updateGanadoRodeo(id, idRodeo) {
  await sequelize.query(
    `UPDATE \`ganado\` SET id_rodeo = :idRodeo, updated_at = NOW() WHERE id_ganado = :id`,
    { replacements: { id, idRodeo }, type: QueryTypes.UPDATE }
  );
  return getGanadoById(id);
}

module.exports = {
  createGanado,
  getGanadoById,
  getGanadoByRodeo,
  updateGanado,
  updateGanadoRodeo,
};
