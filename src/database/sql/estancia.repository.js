'use strict';

const { QueryTypes } = require('sequelize');
const { sequelize } = require('../sequelize');
const { parseGeoJsonColumn } = require('./geometryValidation');

async function createEstancia({ id_usuario, nombre, departamento, provincia, superficie_total_ha }) {
  const [insertId] = await sequelize.query(
    `INSERT INTO \`estancia\`
       (id_usuario, nombre, departamento, provincia, superficie_total_ha, created_at, updated_at)
     VALUES
       (:id_usuario, :nombre, :departamento, :provincia, :superficie_total_ha, NOW(), NOW())`,
    {
      replacements: {
        id_usuario,
        nombre,
        departamento: departamento ?? null,
        provincia: provincia ?? null,
        superficie_total_ha: superficie_total_ha ?? null,
      },
      type: QueryTypes.INSERT,
    }
  );
  return getEstanciaById(insertId);
}

async function getEstanciaById(id) {
  const rows = await sequelize.query(
    `SELECT id_estancia, id_usuario, nombre, departamento, provincia, superficie_total_ha,
            ST_AsGeoJSON(geom) AS geom, created_at, updated_at
     FROM \`estancia\`
     WHERE id_estancia = :id`,
    { replacements: { id }, type: QueryTypes.SELECT }
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return { ...row, geom: parseGeoJsonColumn(row.geom) };
}

// Estancia es 1:1 con Usuario (docs/backend-gap-analysis.md §5.7): a lo
// sumo una fila.
async function getEstanciaByUsuario(id_usuario) {
  const rows = await sequelize.query('SELECT id_estancia FROM `estancia` WHERE id_usuario = :id_usuario', {
    replacements: { id_usuario },
    type: QueryTypes.SELECT,
  });
  if (rows.length === 0) return null;
  return getEstanciaById(rows[0].id_estancia);
}

const UPDATABLE_FIELDS = ['nombre', 'departamento', 'provincia', 'superficie_total_ha'];

async function updateEstancia(id, fields) {
  const entries = Object.entries(fields).filter(([key]) => UPDATABLE_FIELDS.includes(key));
  if (entries.length === 0) return getEstanciaById(id);

  const setClause = entries.map(([key]) => `\`${key}\` = :${key}`).join(', ');
  const replacements = Object.fromEntries(entries);
  replacements.id = id;

  await sequelize.query(`UPDATE \`estancia\` SET ${setClause}, updated_at = NOW() WHERE id_estancia = :id`, {
    replacements,
    type: QueryTypes.UPDATE,
  });
  return getEstanciaById(id);
}

async function deleteEstancia(id, transaction) {
  await sequelize.query('DELETE FROM `estancia` WHERE id_estancia = :id', {
    replacements: { id },
    type: QueryTypes.DELETE,
    transaction,
  });
}

module.exports = {
  createEstancia,
  getEstanciaById,
  getEstanciaByUsuario,
  updateEstancia,
  deleteEstancia,
};
