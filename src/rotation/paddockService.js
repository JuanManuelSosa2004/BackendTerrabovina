'use strict';
const {sequelize}=require('../database/sequelize');
const {QueryTypes}=require('sequelize');
const {today,day,fail}=require('./rules');
const {recommend}=require('./paddockEngine');
const decode=v=>typeof v==='string'?JSON.parse(v):v;
const rows=(sql,replacements={},transaction)=>sequelize.query(sql,{replacements,type:QueryTypes.SELECT,transaction});
const timestamp=v=>!v?0:v instanceof Date?v.getTime():Date.parse(String(v).replace(' ','T')+(/Z$|[+-]\d\d:\d\d$/.test(String(v))?'':'Z'));

async function configuration(id,t) {
  const [row]=await rows('SELECT revision,datos FROM rotacion_config WHERE id_estancia=:id',{id},t);
  return row ? {revision:row.revision, data:decode(row.datos)} : {revision:0,data:{}};
}

async function paddocks(id) {
  return rows(`SELECT p.id_potrero AS id,p.nombre AS name,p.superficie_ha AS area,ST_AsGeoJSON(p.geom) AS geometry,
    (SELECT COUNT(*) FROM asignacion_ganado a JOIN ganado g ON g.id_ganado=a.id_ganado
      WHERE a.id_potrero=p.id_potrero AND a.fecha_hasta IS NULL AND g.activo=1 AND a.fecha_desde<=:date) AS animals,
    (SELECT MAX(a.updated_at) FROM asignacion_ganado a WHERE a.id_potrero=p.id_potrero) AS assignment_changed,
    (SELECT MAX(g.updated_at) FROM ganado g JOIN asignacion_ganado a ON a.id_ganado=g.id_ganado
      WHERE a.id_potrero=p.id_potrero AND a.fecha_hasta IS NULL) AS cattle_changed
    FROM potrero p WHERE p.id_estancia=:id AND p.activo=1 ORDER BY p.id_potrero`,{id,date:today()});
}

function aggregate(p,stock,dmi,revision,included,job) {
  const issues=[];
  let available=null,growth=null,demand=Number(p.animals)===0?0:null,area=Number(p.area);
  const changed=Math.max(timestamp(p.assignment_changed),timestamp(p.cattle_changed));
  const date=today();
  if(stock) {
    if(stock.fecha_objetivo!==date)issues.push('Actualizá el análisis de pasto.');
    if(timestamp(stock.fecha_calculo)<changed)issues.push('Cambió el ganado desde el último balance.');
    const saved=stock.detalle_json?.seguimiento_diario?.geometria;
    const geom=decode(p.geometry);
    if(!saved||JSON.stringify(decode(saved))!==JSON.stringify(geom))issues.push('El balance debe actualizarse con el límite actual del potrero.');
    available=stock.stock_final_total_kg_ms==null?null:Number(stock.stock_final_total_kg_ms);
    growth=stock.crecimiento_utilizable_kg_ms_ha_dia==null?null:Number(stock.crecimiento_utilizable_kg_ms_ha_dia)*area;
    if(revision) {
      const analysis=decode(revision.analisis),geometry=decode(revision.geometria_potrero);
      if(JSON.stringify(geometry)!==JSON.stringify(geom))issues.push('Revisá el análisis de ambientes: cambió el límite del potrero.');
      else {
        const summary=require('../services/intrapotrero.service').summarize({...analysis,fecha:stock.fecha_objetivo},stock,p.animals,revision.id);
        if(summary.pendiente_actualizar)issues.push('Actualizá el balance para incorporar los ambientes del potrero.');
        else {available=summary.stock_accesible_proxy_kg_ms;growth=summary.crecimiento_accesible_total_kg_ms_dia;area=summary.superficie_pastoreable_ha;}
      }
    }
  } else issues.push('Todavía no hay un análisis de pasto.');
  if(Number(p.animals)>0) {
    const age=(Date.now()-timestamp(dmi?.fecha_calculo))/86400000;
    if(dmi&&Number(dmi.cantidad_animales)===Number(p.animals)&&timestamp(dmi.fecha_calculo)>=changed&&age>=0&&age<=7) {
      demand=dmi.kg_materia_seca_dia==null?null:Number(dmi.kg_materia_seca_dia);
    } else issues.push('Actualizá el consumo del potrero.');
  }
  if(!Number.isFinite(area)||area<=0)issues.push('No hay superficie pastoreable disponible.');
  if(job.estado==='EJECUTANDO')issues.push('Actualizando los datos del potrero…');
  return {id:Number(p.id),name:p.name,animals:Number(p.animals),area,stock:available,growth,demand,included,issues,
    stockDate:stock?.fecha_objetivo??null,demandDate:dmi?.fecha_calculo??null,
    accessible:!!revision,job:{estado:job.estado,error:job.error??null}};
}

async function getState(id) {
  const config=await configuration(id), ps=await paddocks(id);
  const excluded=new Set(config.data.simple?.excluded||[]);
  const inputs=[];
  for(const p of ps) {
    const [stock,dmi,revisions]=await Promise.all([
      require('../database/sql/estimacionStock.repository').getUltimaByPotrero(p.id),
      require('../database/sql/estimacionDemanda.repository').getUltimaByPotrero(p.id),
      rows('SELECT * FROM intrapotrero_version WHERE id_potrero=:id ORDER BY id DESC LIMIT 1',{id:p.id})]);
    inputs.push(aggregate(p,stock,dmi,revisions[0],!excluded.has(Number(p.id)),require('../services/stockJobs').get(p.id)));
  }
  return {...recommend(inputs),revision:config.revision,date:today(),start:day(today(),1),
    refreshing:inputs.some(p=>p.job.estado==='EJECUTANDO')};
}

async function saveAvailability(id,body) {
  if(!body||!Number.isInteger(body.revision)||!Array.isArray(body.excluded)||body.excluded.some(n=>!Number.isInteger(n)))fail('Disponibilidad inválida.');
  return sequelize.transaction(async t=>{
    await rows('SELECT id_estancia FROM estancia WHERE id_estancia=:id FOR UPDATE',{id},t);
    const config=await configuration(id,t);
    if(config.revision!==body.revision)fail('La disponibilidad cambió en otra sesión. Actualizá la pantalla.',409);
    const owned=await rows('SELECT id_potrero FROM potrero WHERE id_estancia=:id AND activo=1',{id},t);
    if(body.excluded.some(n=>!owned.some(p=>p.id_potrero===n)))fail('Hay un potrero ajeno o inactivo.');
    const data={...config.data,simple:{excluded:[...new Set(body.excluded)]}};
    await sequelize.query(`INSERT INTO rotacion_config (id_estancia,revision,datos) VALUES (:id,1,:data)
      ON DUPLICATE KEY UPDATE revision=revision+1,datos=VALUES(datos),updated_at=NOW()`,{replacements:{id,data:JSON.stringify(data)},transaction:t});
    return {revision:config.revision+1};
  });
}

async function refresh(id) {
  const config=await configuration(id), excluded=new Set(config.data.simple?.excluded||[]);
  const ps=(await paddocks(id)).filter(p=>!excluded.has(Number(p.id)));
  const jobs=ps.map(p=>({id:p.id,estado:require('../controllers/estimacion.controller').iniciarStock(p.id,today(),Number(p.animals)>0).estado}));
  return {jobs};
}
module.exports={getState,saveAvailability,refresh,aggregate};
