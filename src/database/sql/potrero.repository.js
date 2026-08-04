'use strict';

const { QueryTypes } = require('sequelize');
const { sequelize } = require('../sequelize');
const { parseGeoJsonColumn } = require('./geometryValidation');

async function createPotrero({ id_estancia, nombre, descripcion, superficie_ha, activo }) {
  const [insertId] = await sequelize.query(
    `INSERT INTO \`potrero\`
       (id_estancia, nombre, descripcion, superficie_ha, activo, created_at, updated_at)
     VALUES
       (:id_estancia, :nombre, :descripcion, :superficie_ha, :activo, NOW(), NOW())`,
    {
      replacements: {
        id_estancia,
        nombre,
        descripcion: descripcion ?? null,
        superficie_ha: superficie_ha ?? null,
        activo: activo === undefined ? true : activo,
      },
      type: QueryTypes.INSERT,
    }
  );
  return getPotreroById(insertId);
}

async function getPotreroById(id, transaction) {
  const rows = await sequelize.query(
    `SELECT id_potrero, id_estancia, nombre, descripcion, superficie_ha, activo,
            ST_AsGeoJSON(geom) AS geom, created_at, updated_at
     FROM \`potrero\`
     WHERE id_potrero = :id`,
    { replacements: { id }, type: QueryTypes.SELECT, transaction }
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return { ...row, geom: parseGeoJsonColumn(row.geom) };
}

async function getPotrerosByEstancia(id_estancia) {
  const rows = await sequelize.query(
    `SELECT id_potrero, id_estancia, nombre, descripcion, superficie_ha, activo,
            ST_AsGeoJSON(geom) AS geom, created_at, updated_at
     FROM \`potrero\`
     WHERE id_estancia = :id_estancia
     ORDER BY nombre`,
    { replacements: { id_estancia }, type: QueryTypes.SELECT }
  );
  return rows.map((row) => ({ ...row, geom: parseGeoJsonColumn(row.geom) }));
}

const UPDATABLE_FIELDS = ['nombre', 'descripcion', 'superficie_ha', 'activo'];

async function updatePotrero(id, fields, transaction) {
  const entries = Object.entries(fields).filter(([key]) => UPDATABLE_FIELDS.includes(key));
  if (entries.length === 0) return getPotreroById(id, transaction);

  const setClause = entries.map(([key]) => `\`${key}\` = :${key}`).join(', ');
  const replacements = Object.fromEntries(entries);
  replacements.id = id;

  await sequelize.query(`UPDATE \`potrero\` SET ${setClause}, updated_at = NOW() WHERE id_potrero = :id`, {
    replacements,
    type: QueryTypes.UPDATE,
    transaction,
  });
  return getPotreroById(id, transaction);
}

module.exports = {
  createPotrero,
  getPotreroById,
  getPotrerosByEstancia,
  updatePotrero,
};
