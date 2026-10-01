'use strict';
const crypto=require('crypto');
const catalog=require('./rules.json');
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const day=(s,n=0)=>new Date(Date.parse(s+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const days=(a,b)=>Math.floor((Date.parse(a)-Date.parse(b))/86400000);
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const animalHash=a=>hash([a.id_ganado,a.peso_kg,a.categoria,a.condicion_corporal,a.estado_fisiologico,a.sexo]);
const fail=(s,status=422)=>{const e=new Error(s);e.status=status;throw e;};
const number=(v,min,max,label)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)fail(`${label}: valor entre ${min} y ${max}.`);return v;};
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&day(s)===s;
function validateConfig(c,paddocks,animals){
  if(!c||!Array.isArray(c.groups)||!c.paddocks||typeof c.paddocks!=='object')fail('Configuración inválida.');
  number(c.horizon,1,28,'Horizonte');if(!Number.isInteger(c.horizon))fail('Horizonte entero requerido.');
  if(c.groups.length>40)fail('Máximo 40 grupos.');
  const pids=new Set(paddocks.map(p=>p.id_potrero)),aids=new Set(animals.map(a=>a.id_ganado)),seen=new Set(),gids=new Set();
  for(const g of c.groups){
    if(typeof g.id!=='string'||!/^[a-zA-Z0-9_-]{1,48}$/.test(g.id)||gids.has(g.id))fail('ID de grupo inválido o duplicado.');gids.add(g.id);
    if(typeof g.name!=='string'||!g.name.trim()||g.name.length>100||!Array.isArray(g.animals)||!g.animals.length)fail('Grupo sin nombre o integrantes.');
    if(typeof g.split!=='boolean'||typeof g.selected!=='boolean')fail('Indicá participación y permiso de división.');
    for(const a of g.animals){if(!aids.has(a)||seen.has(a))fail('Animal ajeno, inactivo o repetido en los grupos.');seen.add(a);}
    if(!Array.isArray(g.destinations)||g.destinations.some(p=>!pids.has(p)))fail('Destino inválido.');
    if(g.lock_until&&!validDate(g.lock_until))fail('Fecha de inmovilización inválida.');
    if(!Array.isArray(g.incompatible))fail('Compatibilidades inválidas.');
  }
  for(const g of c.groups)if(g.incompatible.some(id=>!gids.has(id)||id===g.id))fail('Grupo incompatible inexistente.');
  for(const [id,p] of Object.entries(c.paddocks)){
    if(!pids.has(Number(id))||!p||typeof p!=='object')fail('Configuración de potrero ajeno o inactivo.');
    for(const [k,min,max] of [['rest',0,365],['max_stay',1,90],['reserve_ha',0,100000]])if(p[k]!=null){number(p[k],min,max,k);if(k!=='reserve_ha'&&!Number.isInteger(p[k]))fail('Los días deben ser enteros.');}
    if(typeof p.water!=='boolean')fail('Confirmá disponibilidad de agua y acceso.');
    for(const k of ['water_date','last_exit','excluded_from','excluded_until'])if(p[k]&&!validDate(p[k]))fail('Fecha inválida: '+k);
    if(p.last_exit&&p.last_exit>today())fail('Última salida no puede ser futura.');
    if(p.excluded_until&&(!p.excluded_from||p.excluded_until<p.excluded_from))fail('Rango de exclusión inválido.');
    if(p.excluded_from&&(!p.reason||p.reason.length>300))fail('Indicá el motivo de exclusión.');
  }
  return c;
}
function occupancy(p,assignments,start,declaredExit){
  const intervals=assignments.filter(a=>a.id_potrero===p.id_potrero).map(a=>({from:String(a.fecha_desde).slice(0,10),to:a.fecha_hasta?String(a.fecha_hasta).slice(0,10):null})).filter(a=>a.from<=start).sort((a,b)=>a.from.localeCompare(b.from));
  const merged=[];for(const r of intervals){const prev=merged.at(-1);if(prev&&(!prev.to||prev.to>=r.from)){prev.to=(!prev.to||!r.to)?null:(prev.to>r.to?prev.to:r.to);}else merged.push({...r});}
  const active=merged.find(r=>r.from<=start&&(!r.to||r.to>start));
  const last=merged.filter(r=>r.to&&r.to<=start).at(-1)?.to;
  const exit=[last,declaredExit].filter(Boolean).sort().at(-1);
  return {occupied_days:active?Math.max(0,days(start,active.from)):0,rested_days:!active&&exit?Math.max(0,days(start,exit)):0,known:!!active||!!exit};
}
function infer(snapshot){
  const {config:c,paddocks,animals,assignments,start}=snapshot,issues=[],trace=[],units=[];
  const ps=paddocks.map(p=>{
    const cfg=c.paddocks[p.id_potrero]??{},occ=occupancy(p,assignments,start,cfg.last_exit);
    for(const k of ['rest','max_stay','reserve_ha'])if(cfg[k]==null)issues.push(`${p.nombre}: falta ${k}.`);
    if(!occ.known)issues.push(`${p.nombre}: falta historial o última salida declarada.`);
    if(!p.offer||p.offer.date!==start)issues.push(`${p.nombre}: falta oferta utilizable y crecimiento con fecha de hoy.`);
    if(cfg.water&&(!cfg.water_date||days(start,cfg.water_date)>7||cfg.water_date>start))issues.push(`${p.nombre}: reconfirmá agua y acceso (vigencia operativa 7 días).`);
    if(p.offer&&(!Number.isFinite(p.offer.area)||p.offer.area<=0||p.offer.area>Number(p.superficie_ha)||['stock','growth'].some(k=>!Number.isFinite(p.offer[k])||p.offer[k]<0)))issues.push(`${p.nombre}: superficie u oferta accesible inválida.`);
    const available=Array.from({length:c.horizon},(_,d)=>{
      const date=day(start,d),reasons=[];
      if(!cfg.water)reasons.push('WATER');
      if(cfg.excluded_from&&date>=cfg.excluded_from&&(!cfg.excluded_until||date<=cfg.excluded_until))reasons.push('EXCLUDED');
      if(reasons.length)trace.push({paddock:p.id_potrero,date,rules:reasons});
      return !reasons.length;
    });
    return {id:p.id_potrero,name:p.nombre,stock:p.offer?.stock??0,growth:(p.offer?.growth??0)*(c.conservative?0.8:1),reserve:(cfg.reserve_ha??0)*(p.offer?.area??0),rest:cfg.rest??0,max_stay:cfg.max_stay??1,...occ,available};
  });
  const seen=new Set();
  function add(g,members,fixed=false){
    const origins=[...new Set(members.map(a=>a.origin))];
    if(origins.includes(null)||origins.includes(undefined)){issues.push(`${g.name}: hay animales sin potrero.`);return;}
    if(origins.length>1){issues.push(`${g.name}: los integrantes están en distintos potreros; habilitá división o corregí el grupo.`);return;}
    if(members.some(a=>!a.demand||a.demand.hash!==animalHash(a)||days(start,a.demand.date)>7))issues.push(`${g.name}: falta consumo individual vigente; actualizar DMI.`);
    const origin=origins[0];
    const allowed=ps.map(p=>Array.from({length:c.horizon},(_,d)=>{
      const date=day(start,d),reasons=[];
      if(g.destinations.length&&!g.destinations.includes(p.id)&&p.id!==origin)reasons.push('DESTINATION');
      if(g.lock_until&&date<=g.lock_until&&p.id!==origin)reasons.push('LOCK');
      if(reasons.length)trace.push({group:g.id,paddock:p.id,date,rules:reasons});
      return !reasons.length;
    }));
    units.push({id:g.unit_id??g.id,group:g.id,name:g.name,origin,animals:members.map(a=>a.id_ganado),demand:members.reduce((n,a)=>n+(a.demand?.kg??0),0),fixed,allowed,incompatible:g.incompatible});
  }
  for(const g of c.groups){
    const members=g.animals.map(id=>animals.find(a=>a.id_ganado===id)).filter(Boolean);
    if(members.length!==g.animals.length){issues.push(`${g.name}: cambió el ganado; revisar integrantes.`);continue;}
    members.forEach(a=>seen.add(a.id_ganado));
    if(g.split){for(const a of members)add({...g,unit_id:g.id+'_'+a.id_ganado,name:g.name+' · '+a.numero_identificacion},[a],!g.selected);}
    else add(g,members,!g.selected);
  }
  for(const a of animals.filter(a=>!seen.has(a.id_ganado)))add({id:'fixed_'+a.id_ganado,name:'Sin grupo · '+a.numero_identificacion,destinations:[],incompatible:[]},[a],true);
  if(!c.groups.some(g=>g.selected))issues.push('Seleccioná al menos un grupo para planificar.');
  if(units.length>80)issues.push('Demasiadas unidades: deshabilitá división o agrupá animales (máximo 80).');
  if(paddocks.length>30)issues.push('Esta versión admite hasta 30 potreros activos por estancia.');
  return {issues:[...new Set(issues)],trace,version:catalog.version,input:{start,horizon:c.horizon,paddocks:ps,units}};
}
module.exports={today,day,days,hash,animalHash,fail,number,validDate,validateConfig,occupancy,infer,catalog};
