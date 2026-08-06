'use strict';

const { QueryTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const UPDATABLE_FIELDS = ['nombre', 'rol', 'telefono'];

const SELECT_FIELDS =
  'id_empleado, id_estancia, nombre, rol, telefono, activo, created_at, updated_at';

async function createEmpleado({ id_estancia, nombre, rol, telefono }) {
  const [insertId] = await sequelize.query(
    `INSERT INTO \`empleado\`
       (id_estancia, nombre, rol, telefono, activo, created_at, updated_at)
     VALUES
       (:id_estancia, :nombre, :rol, :telefono, TRUE, NOW(), NOW())`,
    {
      replacements: { id_estancia, nombre, rol, telefono: telefono ?? null },
      type: QueryTypes.INSERT,
    }
  );
  return getEmpleadoById(insertId);
}

async function getEmpleadoById(id) {
  const rows = await sequelize.query(`SELECT ${SELECT_FIELDS} FROM \`empleado\` WHERE id_empleado = :id`, {
    replacements: { id },
    type: QueryTypes.SELECT,
  });
  return rows[0] ?? null;
}

async function getEmpleadosByEstancia(id_estancia) {
  return sequelize.query(
    `SELECT ${SELECT_FIELDS} FROM \`empleado\` WHERE id_estancia = :id_estancia AND activo = TRUE ORDER BY nombre`,
    { replacements: { id_estancia }, type: QueryTypes.SELECT }
  );
}

async function updateEmpleado(id, fields) {
  const keys = UPDATABLE_FIELDS.filter((key) => fields[key] !== undefined);
  if (keys.length > 0) {
    const setClause = keys.map((key) => `\`${key}\` = :${key}`).join(', ');
    const replacements = keys.reduce((acc, key) => ({ ...acc, [key]: fields[key] }), { id });
    await sequelize.query(`UPDATE \`empleado\` SET ${setClause}, updated_at = NOW() WHERE id_empleado = :id`, {
      replacements,
      type: QueryTypes.UPDATE,
    });
  }
  return getEmpleadoById(id);
}

async function darDeBaja(id) {
  await sequelize.query('UPDATE `empleado` SET activo = FALSE, updated_at = NOW() WHERE id_empleado = :id', {
    replacements: { id },
    type: QueryTypes.UPDATE,
  });
}

module.exports = { createEmpleado, getEmpleadoById, getEmpleadosByEstancia, updateEmpleado, darDeBaja };
