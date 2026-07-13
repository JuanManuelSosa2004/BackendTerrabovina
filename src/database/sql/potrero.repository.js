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

async function getPotreroById(id) {
  const rows = await sequelize.query(
    `SELECT id_potrero, id_estancia, nombre, descripcion, superficie_ha, activo,
            ST_AsGeoJSON(geom) AS geom, created_at, updated_at
     FROM \`potrero\`
     WHERE id_potrero = :id`,
    { replacements: { id }, type: QueryTypes.SELECT }
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return { ...row, geom: parseGeoJsonColumn(row.geom) };
}

module.exports = { createPotrero, getPotreroById };
