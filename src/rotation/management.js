'use strict';
const {sequelize}=require('../database/sequelize');
const {QueryTypes}=require('sequelize');
const {fail,animalHash,today}=require('./rules');
const CATEGORIES=['TERNERO','VAQUILLONA','NOVILLO','VACA','TORO'];
const rows=(sql,replacements={},transaction)=>sequelize.query(sql,{replacements,type:QueryTypes.SELECT,transaction});
const decode=v=>typeof v==='string'?JSON.parse(v):v;
async function snapshot(id,t){
  const [row]=await rows('SELECT revision,datos FROM rotacion_config WHERE id_estancia=:id',{id},t);
  const data=decode(row?.datos)||{};
  const animals=await rows(`SELECT g.*,a.id_potrero AS origin,a.fecha_desde,d.kg_dia,d.atributos_hash,d.calculado_en
    FROM ganado g LEFT JOIN asignacion_ganado a ON a.id_ganado=g.id_ganado AND a.fecha_hasta IS NULL
    LEFT JOIN rotacion_demanda d ON d.id_ganado=g.id_ganado
    WHERE g.id_estancia=:id AND g.activo=1 ORDER BY g.id_ganado`,{id},t);
  const raw=data.management||{paddocks:{},groups:[],split:{}};
  const live=new Set(animals.map(a=>Number(a.id_ganado)));
  const management={...raw,groups:(raw.groups||[]).map(g=>({...g,animalIds:g.animalIds.filter(i=>live.has(i))})).filter(g=>g.animalIds.length)};
  return {revision:row?.revision||0,data,management,animals};
}
function buildGroups(animals,management){
  const claimed=new Set(),groups=[];
  const add=(definition,members,manual)=>{
    const origins=[...new Set(members.map(a=>Number(a.origin)||null))];
    for(const origin of origins){
      if(!origin)continue;
      const part=members.filter(a=>Number(a.origin)===origin);
      const issues=[];
      if(origins.length>1&&!definition.allowSplit)issues.push('El grupo está repartido entre potreros. Revisá sus integrantes.');
      if(part.some(a=>a.fecha_desde>today()))issues.push('El grupo tiene ingresos futuros.');
      const mapped=part.map(a=>{
        const age=(Date.now()-new Date(a.calculado_en).getTime())/86400000;
        const valid=Number(a.kg_dia)>0&&a.atributos_hash===animalHash(a)&&age>=0&&age<=7;
        return {id:Number(a.id_ganado),category:a.categoria,sex:a.sexo,
          condition:a.condicion_corporal==null?null:Number(a.condicion_corporal),demand:valid?Number(a.kg_dia):null};
      });
      if(mapped.some(a=>a.demand==null))issues.push('Actualizá los datos para obtener el consumo del grupo.');
      groups.push({...definition,id:`${definition.id}@${origin}`,configId:definition.id,origin,manual,
        allowSplit:!!definition.allowSplit&&!definition.motherCalf,isolated:!!definition.isolated,
        motherCalf:!!definition.motherCalf,animals:mapped,issues});
    }
  };
  for(const definition of management.groups||[]){
    const members=animals.filter(a=>definition.animalIds.includes(Number(a.id_ganado)));
    members.forEach(a=>claimed.add(Number(a.id_ganado)));add(definition,members,true);
  }
  const automatic=new Map();
  for(const a of animals){
    if(claimed.has(Number(a.id_ganado))||!a.origin)continue;
    const key=`auto:${a.origin}:${a.categoria}`;
    if(!automatic.has(key))automatic.set(key,[]);automatic.get(key).push(a);
  }
  const labels={TERNERO:'Terneros',VAQUILLONA:'Vaquillonas',NOVILLO:'Novillos',VACA:'Vacas',TORO:'Toros'};
  for(const [id,members] of automatic)add({id,name:labels[members[0].categoria]||members[0].categoria,allowSplit:!!management.split?.[id]},members,false);
  return groups;
}
async function get(id,t){
  const s=await snapshot(id,t),ps=await rows('SELECT id_potrero,nombre FROM potrero WHERE id_estancia=:id AND activo=1',{id},t);
  const owned=new Map(ps.map(p=>[Number(p.id_potrero),p.nombre]));
  s.management.paddocks=Object.fromEntries(Object.entries(s.management.paddocks).filter(([k])=>owned.has(Number(k))));
  return {revision:s.revision,management:s.management,groups:buildGroups(s.animals,s.management).map(g=>({...g,originName:owned.get(g.origin)||'Potrero'})),categories:CATEGORIES};
}
function validate(management,animals,paddocks){
  if(!management||!Array.isArray(management.groups)||!management.paddocks||typeof management.paddocks!=='object'||Array.isArray(management.paddocks)||!management.split||typeof management.split!=='object'||Array.isArray(management.split))fail('Reglas de manejo inválidas.');
  const owned=new Set(paddocks.map(p=>Number(p.id_potrero))),used=new Set(),ids=new Set();
  for(const [key,p] of Object.entries(management.paddocks)){
    if(!owned.has(Number(key))||!p||!Array.isArray(p.categories)||p.categories.some(c=>!CATEGORIES.includes(c))||typeof p.service!=='boolean')fail('Categorías o potrero de manejo inválidos.');
  }
  for(const [key,v] of Object.entries(management.split))if(!/^auto:\d+:(TERNERO|VAQUILLONA|NOVILLO|VACA|TORO)$/.test(key)||typeof v!=='boolean')fail('División de grupos inválida.');
  for(const g of management.groups){
    if(!g||typeof g.id!=='string'||!/^group:[a-zA-Z0-9-]{1,80}$/.test(g.id)||ids.has(g.id)||typeof g.name!=='string'||!g.name.trim()||g.name.length>80||!Array.isArray(g.animalIds)||!g.animalIds.length||['allowSplit','motherCalf','isolated'].some(k=>typeof g[k]!=='boolean'))fail('Grupo inválido.');
    ids.add(g.id);
    const members=g.animalIds.map(id=>{const a=animals.find(a=>Number(a.id_ganado)===id);if(!Number.isInteger(id)||!a||used.has(id))fail('Hay animales ajenos, dados de baja o repetidos en los grupos.');used.add(id);return a;});
    if(members.some(a=>!a.origin)||(!g.allowSplit&&new Set(members.map(a=>Number(a.origin))).size!==1))fail('Los integrantes del grupo deben estar en el mismo potrero.');
    if(g.motherCalf&&(g.allowSplit||!members.some(a=>a.categoria==='VACA')||!members.some(a=>a.categoria==='TERNERO')||members.some(a=>!['VACA','TERNERO'].includes(a.categoria))))fail('El grupo madre-cría debe contener vacas y terneros y mantenerse unido.');
  }
}
async function save(id,body){
  if(!Number.isInteger(body?.revision))fail('Revisión inválida.');
  return sequelize.transaction(async t=>{
    await rows('SELECT id_estancia FROM estancia WHERE id_estancia=:id FOR UPDATE',{id},t);
    const s=await snapshot(id,t);
    if(body.revision!==s.revision)fail('Las reglas cambiaron en otra sesión. Volvé a abrirlas.',409);
    const ps=await rows('SELECT id_potrero FROM potrero WHERE id_estancia=:id AND activo=1',{id},t);
    validate(body.management,s.animals,ps);
    await sequelize.query(`INSERT INTO rotacion_config (id_estancia,revision,datos) VALUES (:id,1,:data)
      ON DUPLICATE KEY UPDATE revision=revision+1,datos=VALUES(datos),updated_at=NOW()`,
      {replacements:{id,data:JSON.stringify({...s.data,management:body.management})},transaction:t});
    return {revision:s.revision+1};
  });
}
async function cacheDemand(animals,prediction,t){
  if(!Array.isArray(prediction.predicciones)||prediction.predicciones.length!==animals.length)fail('El modelo devolvió consumos incompletos.',502);
  for(const a of animals){
    const matches=prediction.predicciones.filter(p=>String(p.animal_id)===String(a.id_ganado));
    const kg=Number(matches[0]?.dmi_kg_dia);
    if(matches.length!==1||!Number.isFinite(kg)||kg<=0)fail('El modelo devolvió un consumo inválido.',502);
    await sequelize.query(`INSERT INTO rotacion_demanda (id_ganado,kg_dia,atributos_hash,modelo,calculado_en,advertencias)
      VALUES (:a,:kg,:hash,'DMI_EXISTENTE',NOW(),:warnings) ON DUPLICATE KEY UPDATE kg_dia=VALUES(kg_dia),
      atributos_hash=VALUES(atributos_hash),modelo=VALUES(modelo),calculado_en=NOW(),advertencias=VALUES(advertencias)`,
      {replacements:{a:a.id_ganado,kg,hash:animalHash(a),warnings:JSON.stringify(prediction.advertencias||[])},transaction:t});
  }
}
module.exports={snapshot,buildGroups,get,save,validate,cacheDemand,CATEGORIES};
