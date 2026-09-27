'use strict';
const {QueryTypes} = require('sequelize');
const {sequelize} = require('../sequelize');
const json = v => typeof v === 'string' ? JSON.parse(v) : v;
const decode = r => ({...r,configuracion:json(r.configuracion),analisis:json(r.analisis),geometria_potrero:json(r.geometria_potrero)});
async function history(id,transaction) {
  const rows = await sequelize.query('SELECT * FROM intrapotrero_version WHERE id_potrero=:id ORDER BY id ASC',
    {replacements:{id},type:QueryTypes.SELECT,transaction});
  return rows.map(decode);
}
async function latest(id,transaction) {
  const rows = await sequelize.query('SELECT * FROM intrapotrero_version WHERE id_potrero=:id ORDER BY id DESC LIMIT 1',
    {replacements:{id},type:QueryTypes.SELECT,transaction});
  return rows[0] ? decode(rows[0]) : null;
}
async function create({id_potrero,id_usuario,vigente_desde,geometria_potrero,configuracion,analisis},transaction) {
  await sequelize.query(`INSERT INTO intrapotrero_version
    (id_potrero,id_usuario,vigente_desde,geometria_potrero,configuracion,analisis,created_at)
    VALUES (:id_potrero,:id_usuario,:vigente_desde,:geom,:config,:analysis,NOW())`,{
      replacements:{id_potrero,id_usuario,vigente_desde,geom:JSON.stringify(geometria_potrero),
        config:JSON.stringify(configuracion),analysis:JSON.stringify(analisis)},type:QueryTypes.INSERT,transaction});
  return latest(id_potrero,transaction);
}
module.exports={history,latest,create};
