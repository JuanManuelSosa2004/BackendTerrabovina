'use strict';
const {sequelize}=require('../database/sequelize');
const {QueryTypes}=require('sequelize');
const R=require('./rules');
const decode=v=>typeof v==='string'?JSON.parse(v):v;
const rows=(sql,replacements={},transaction)=>sequelize.query(sql,{replacements,type:QueryTypes.SELECT,transaction});
async function lock(id,t){await rows('SELECT id_estancia FROM estancia WHERE id_estancia=:id FOR UPDATE',{id},t);}
async function ensure(id,t){
  await sequelize.query('INSERT IGNORE INTO rotacion_config (id_estancia,revision,datos) VALUES (:id,0,:data)',{replacements:{id,data:JSON.stringify({horizon:14,conservative:false,groups:[],paddocks:{}})},transaction:t});
}
async function snapshot(id,t){
  await ensure(id,t);
  const [cr]=await rows('SELECT revision,datos FROM rotacion_config WHERE id_estancia=:id',{id},t);
  const config=decode(cr.datos);
  const paddocks=await rows('SELECT id_potrero,nombre,superficie_ha,ST_AsGeoJSON(geom) AS geojson FROM potrero WHERE id_estancia=:id AND activo=1 ORDER BY id_potrero',{id},t);
  const animals=await rows(`SELECT g.*,a.id_potrero AS origin,a.fecha_desde,a.dmi_ingreso_kg_dia,
    d.kg_dia,d.atributos_hash,d.modelo AS modelo_dmi,d.calculado_en,d.advertencias
    FROM ganado g LEFT JOIN asignacion_ganado a ON a.id_ganado=g.id_ganado AND a.fecha_hasta IS NULL
    LEFT JOIN rotacion_demanda d ON d.id_ganado=g.id_ganado WHERE g.id_estancia=:id AND g.activo=1 ORDER BY g.id_ganado`,{id},t);
  for(const a of animals){a.demand=a.kg_dia?{kg:Number(a.kg_dia),hash:a.atributos_hash,date:new Date(a.calculado_en).toISOString().slice(0,10),model:a.modelo_dmi,warnings:decode(a.advertencias)||[]}:null;}
  const assignments=await rows(`SELECT a.id_ganado,a.id_potrero,a.fecha_desde,a.fecha_hasta,a.estado,a.dmi_ingreso_kg_dia FROM asignacion_ganado a JOIN potrero p ON p.id_potrero=a.id_potrero WHERE p.id_estancia=:id ORDER BY a.id_asignacion`,{id},t);
  const observations=await rows('SELECT * FROM rotacion_observacion WHERE id_estancia=:id ORDER BY id DESC',{id},t);
  for(const p of paddocks){
    p.geom=p.geojson?decode(p.geojson):null;delete p.geojson;
    const obs=observations.find(o=>o.id_potrero===p.id_potrero&&String(o.fecha).slice(0,10)===R.today());
    if(obs){const v=decode(obs.datos);p.offer={...v,id:obs.id,date:String(obs.fecha).slice(0,10),source:v.method};}
    else {
      // The ledger is a closing balance: yesterday's closing is today's opening.
      const openingDate=R.day(R.today(),-1);
      const [s]=await rows('SELECT * FROM estimacion_stock WHERE id_potrero=:p AND fecha_objetivo=:date ORDER BY id_estimacion_stock DESC LIMIT 1',{p:p.id_potrero,date:openingDate},t);
      const [v]=await rows('SELECT * FROM intrapotrero_version WHERE id_potrero=:p ORDER BY id DESC LIMIT 1',{p:p.id_potrero},t);
      if(s){s.detalle_json=decode(s.detalle_json);let area=Number(p.superficie_ha),stock=Number(s.stock_final_total_kg_ms),growth=Number(s.crecimiento_utilizable_kg_ms_ha_dia)*area;
        if(v){const analysis=decode(v.analisis),geometry=decode(v.geometria_potrero);
          if(!require('../services/intrapotrero.service').sameGeometry(geometry,p.geom)||analysis.fecha!==openingDate){p.offer=null;continue;}
          const summary=require('../services/intrapotrero.service').summarize(analysis,{...s,fecha_objetivo:String(s.fecha_objetivo).slice(0,10)},0,v.id);
          if(summary.pendiente_actualizar){p.offer=null;continue;}
          area=summary.superficie_pastoreable_ha;stock=summary.stock_accesible_proxy_kg_ms;growth=summary.crecimiento_accesible_total_kg_ms_dia;
        }
        p.offer={area,stock,growth,date:R.today(),source_date:openingDate,source:'SALDO_CIERRE_ANTERIOR',id:s.id_estimacion_stock};
      }else p.offer=null;
    }
  }
  return {start:R.today(),revision:cr.revision,config,paddocks,animals,assignments};
}
async function getState(id){const s=await snapshot(id);const inferred=R.infer(s);return {...s,fingerprint:R.hash(s),diagnostic:{issues:inferred.issues,trace:inferred.trace},rules:R.catalog,plans:await listPlans(id),local:process.env.ROTATION_LOCAL_ONLY==='true'};}
async function saveConfig(id,body){return sequelize.transaction(async t=>{
  await lock(id,t);const s=await snapshot(id,t);
  if(body.revision!==s.revision)R.fail('La configuración cambió en otra sesión. Recargá antes de guardar.',409);
  R.validateConfig(body.config,s.paddocks,s.animals);
  if(typeof body.config.conservative!=='boolean')R.fail('Escenario inválido.');
  await sequelize.query('UPDATE rotacion_config SET datos=:data,revision=revision+1,updated_at=NOW() WHERE id_estancia=:id',{replacements:{id,data:JSON.stringify(body.config)},transaction:t});
  return {revision:s.revision+1};
});}
async function observation(id,user,body){return sequelize.transaction(async t=>{
  await lock(id,t);
  const [p]=await rows('SELECT * FROM potrero WHERE id_potrero=:p AND id_estancia=:id AND activo=1',{p:body.paddock,id},t);
  if(!p)R.fail('Potrero no encontrado.',404);
  if(!R.validDate(body.date)||body.date>R.today())R.fail('Fecha de observación inválida.');
  const area=R.number(body.area,0.001,Number(p.superficie_ha),'Superficie accesible');
  const growth=R.number(body.growth_ha,0,1000,'Crecimiento utilizable por ha')*area;
  let stock;
  if(body.method==='AFORO'){
    const biomass=R.number(body.biomass_ha,0,100000,'Biomasa'),residual=R.number(body.residual_ha,0,biomass,'Remanente'),efficiency=R.number(body.efficiency,0.01,1,'Eficiencia');
    stock=(biomass-residual)*efficiency*area;
  }else if(body.method==='PRESUPUESTO_UTILIZABLE')stock=R.number(body.stock_ha,0,100000,'Oferta utilizable por ha')*area;
  else R.fail('Método de observación inválido.');
  if(typeof body.note!=='string'||!body.note.trim()||body.note.length>500)R.fail('Indicá origen o método de la observación (hasta 500 caracteres).');
  const [result]=await sequelize.query('INSERT INTO rotacion_observacion (id_estancia,id_potrero,fecha,datos,id_usuario) VALUES (:id,:p,:date,:data,:user)',{replacements:{id,p:body.paddock,date:body.date,data:JSON.stringify({...body,area,stock,growth}),user},transaction:t});
  return {id:result};
});}
async function refreshDemand(id){
  const s=await snapshot(id);if(!s.animals.length)R.fail('No hay animales.');
  const input=s.animals.map(require('../controllers/estimacion.controller').aAnimalDelModelo);
  let result;try{result=await require('../services/modeloPredictivo.client').predictDmi({animales:input});}catch(e){R.fail(e.message,503);}
  if(!Array.isArray(result.predicciones)||result.predicciones.length!==s.animals.length)R.fail('Respuesta DMI incompleta.',503);
  return sequelize.transaction(async t=>{
    await lock(id,t);const fresh=await snapshot(id,t);
    if(R.hash(fresh.animals.map(R.animalHash))!==R.hash(s.animals.map(R.animalHash)))R.fail('El ganado cambió durante el cálculo.',409);
    for(const a of s.animals){const pred=result.predicciones.find(p=>String(p.animal_id)===String(a.id_ganado));const value=Number(pred?.dmi_kg_dia);if(!Number.isFinite(value)||value<=0)R.fail('El modelo no devolvió consumos válidos.',503);
      await sequelize.query(`INSERT INTO rotacion_demanda (id_ganado,kg_dia,atributos_hash,modelo,calculado_en,advertencias) VALUES (:a,:kg,:hash,:model,NOW(),:warnings) ON DUPLICATE KEY UPDATE kg_dia=VALUES(kg_dia),atributos_hash=VALUES(atributos_hash),modelo=VALUES(modelo),calculado_en=NOW(),advertencias=VALUES(advertencias)`,{replacements:{a:a.id_ganado,kg:value,hash:R.animalHash(a),model:'DMI_EXISTENTE',warnings:JSON.stringify(result.advertencias??[])},transaction:t});
    }
    return {animals:s.animals.length,warnings:result.advertencias??[]};
  });
}
async function listPlans(id){return rows('SELECT id,estado,created_at,JSON_UNQUOTE(JSON_EXTRACT(resultado,\'$.status\')) AS resultado_estado FROM rotacion_plan WHERE id_estancia=:id ORDER BY id DESC LIMIT 50',{id});}
async function getPlan(id,pid,t){const [p]=await rows('SELECT * FROM rotacion_plan WHERE id=:pid AND id_estancia=:id',{id,pid},t);if(!p)R.fail('Plan no encontrado.',404);p.snapshot=decode(p.snapshot);p.resultado=decode(p.resultado);p.executions=await rows('SELECT paso,id_traslado FROM rotacion_ejecucion WHERE id_plan=:pid',{pid},t);return p;}
async function generate(id,user){
  const s=await snapshot(id),inferred=R.infer(s);let result;
  if(inferred.issues.length)result={status:'DATOS_INSUFICIENTES',issues:inferred.issues,steps:[],projection:[],baseline:[]};
  else {let response;try{response=await fetch(`${(process.env.ROTATION_API_BASE_URL||process.env.MODEL_API_BASE_URL||'').replace(/\/$/,'')}/rotation/plan`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(inferred.input),signal:AbortSignal.timeout(25000)});}catch{R.fail('El planificador no respondió. No se modificó ningún animal.',503);}
    result=await response.json();if(!response.ok)R.fail(result.error||'Error del planificador.',503);
    if(!['OPTIMO','FACTIBLE','INVIABLE','INCONCLUSO'].includes(result.status)||!Array.isArray(result.steps))R.fail('Contrato del planificador inválido.',503);
    if(['OPTIMO','FACTIBLE'].includes(result.status))require('./verify')(inferred.input,result);
  }
  result.rule_trace=inferred.trace;result.rules_version=inferred.version;
  result.warnings=[...new Set(s.animals.flatMap(a=>a.demand?.warnings??[]))];
  result.model_limitations=['DMI entrenado con datos de Bomet, Kenia; pendiente de validación local en Argentina.','DMI no incorpora clima ni calidad o disponibilidad del forraje.'];
  return sequelize.transaction(async t=>{
    await lock(id,t);const fresh=await snapshot(id,t);if(R.hash(fresh)!==R.hash(s))R.fail('Los datos cambiaron durante el cálculo. Generá otra propuesta.',409);
    const [pid]=await sequelize.query('INSERT INTO rotacion_plan (id_estancia,id_usuario,estado,snapshot_hash,snapshot,resultado) VALUES (:id,:user,\'PROPUESTO\',:hash,:s,:r)',{replacements:{id,user,hash:R.hash(s),s:JSON.stringify({...s,inference:inferred}),r:JSON.stringify(result)},transaction:t});
    return getPlan(id,pid,t);
  });
}
async function setPlanState(id,pid,action){return sequelize.transaction(async t=>{
  await lock(id,t);const plan=await getPlan(id,pid,t);
  if(!['ACEPTADO','RECHAZADO'].includes(action))R.fail('Estado inválido.');
  if(plan.estado!=='PROPUESTO')R.fail('El plan ya no está pendiente.',409);
  if(action==='ACEPTADO'){
    if(!['OPTIMO','FACTIBLE'].includes(plan.resultado.status))R.fail('Este resultado no es un plan ejecutable.');
    if(R.hash(await snapshot(id,t))!==plan.snapshot_hash)R.fail('El plan está desactualizado. Generá uno nuevo.',409);
  }
  await sequelize.query('UPDATE rotacion_plan SET estado=:action WHERE id=:pid',{replacements:{action,pid},transaction:t});return getPlan(id,pid,t);
});}
async function executeToday(id,pid,user){return sequelize.transaction(async t=>{
  await lock(id,t);const p=await getPlan(id,pid,t);
  if(p.executions.length)return {already_executed:true,executions:p.executions};
  if(p.estado!=='ACEPTADO')R.fail('Primero aceptá un plan vigente.',409);
  // Locks also coordinate with ordinary edits to current assignments/animals/paddocks.
  await rows('SELECT id_potrero FROM potrero WHERE id_estancia=:id ORDER BY id_potrero FOR UPDATE',{id},t);
  await rows('SELECT id_ganado FROM ganado WHERE id_estancia=:id ORDER BY id_ganado FOR UPDATE',{id},t);
  await rows('SELECT a.id_asignacion FROM asignacion_ganado a JOIN ganado g ON g.id_ganado=a.id_ganado WHERE g.id_estancia=:id ORDER BY a.id_asignacion FOR UPDATE',{id},t);
  const s=await snapshot(id,t);if(R.hash(s)!==p.snapshot_hash)R.fail('Cambió el estado de la estancia. Recalculá antes del traslado.',409);
  const steps=p.resultado.steps.filter(step=>step.date===R.today());if(!steps.length)R.fail('No hay movimientos para hoy. Los futuros se revalidan generando un plan ese día.');
  const animalSet=new Set();for(const step of steps)for(const aid of step.animals){if(animalSet.has(aid))R.fail('Movimiento duplicado en el plan.',409);animalSet.add(aid);const a=s.animals.find(a=>a.id_ganado===aid);if(!a||a.origin!==step.origin)R.fail('Asignación modificada.',409);}
  const transfers=require('../database/sql/trasladoGanado.repository'),assign=require('../database/sql/asignacionGanado.repository');
  for(const step of steps){
    const header=await transfers.crearTraslado({id_estancia:id,id_potrero_origen:step.origin,id_potrero_destino:step.destination,fecha_movimiento:new Date(),observaciones:`Rotación · plan ${pid} · ${step.name}`,id_usuario:user},t);
    for(const aid of step.animals){
      const [a]=await rows('SELECT * FROM asignacion_ganado WHERE id_ganado=:aid AND fecha_hasta IS NULL',{aid},t);
      await assign.cerrarAsignacion(a.id_asignacion,R.today(),'FINALIZADA',t);
      const next=await assign.crearAsignacion({id_ganado:aid,id_potrero:step.destination,fecha_desde:R.today(),estado:'ACTIVA'},t);
      const animal=s.animals.find(a=>a.id_ganado===aid);
      await sequelize.query('UPDATE asignacion_ganado SET dmi_ingreso_kg_dia=:dmi WHERE id_asignacion=:a',{replacements:{dmi:animal.demand.kg,a:next.id_asignacion},transaction:t});
      await transfers.crearDetalle({id_traslado:header.id_traslado,id_ganado:aid,id_asignacion_origen:a.id_asignacion,id_asignacion_destino:next.id_asignacion},t);
    }
    await sequelize.query('INSERT INTO rotacion_ejecucion (id_plan,paso,id_traslado) VALUES (:pid,:step,:transfer)',{replacements:{pid,step:step.id,transfer:header.id_traslado},transaction:t});
  }
  await sequelize.query("UPDATE rotacion_plan SET estado='REVISAR_RESTANTE' WHERE id=:pid",{replacements:{pid},transaction:t});
  return {movements:steps.length,message:'Movimientos registrados. Generá una nueva propuesta para actualizar los pasos restantes.'};
});}
module.exports={snapshot,getState,saveConfig,observation,refreshDemand,listPlans,getPlan,generate,setPlanState,executeToday};
