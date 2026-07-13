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

module.exports = { createEstancia, getEstanciaById };
