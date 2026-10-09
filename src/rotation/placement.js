'use strict';
const {fail}=require('./rules');

// The same hard husbandry rules apply to intake, first assignment and category
// edits. These checks do not require a forage estimate or prohibit recording
// a new weight/body-condition observation when the existing herd needs review.
function validatePlacement(paddock, candidates, animals, management) {
  if(!paddock?.activo||!paddock.habilitado_ganado)fail('El potrero está dado de baja o fuera de uso.');
  const id=Number(paddock.id_potrero), policy=management.paddocks?.[id]||{};
  if(candidates.some(a=>!(policy.categories||['TERNERO','VAQUILLONA','NOVILLO','VACA','TORO']).includes(a.categoria)))fail('El potrero no admite las categorías del ganado.');
  const changing=new Set(candidates.map(a=>Number(a.id_ganado)).filter(Boolean));
  const residents=animals.filter(a=>Number(a.origin)===id&&!changing.has(Number(a.id_ganado)));
  const categories=new Set([...residents,...candidates].map(a=>a.categoria));
  if(categories.has('TORO')&&categories.has('TERNERO'))fail('No se permite mezclar toros con terneros.');
  if(categories.has('TORO')&&(categories.has('VACA')||categories.has('VAQUILLONA'))&&!policy.service)fail('La convivencia con toros requiere servicio reproductivo habilitado.');
  const groupFor=a=>(management.groups||[]).find(g=>g.animalIds.includes(Number(a.id_ganado)));
  const occupants=[...residents,...candidates];
  for(const a of occupants){
    const g=groupFor(a);
    if(g?.isolated&&occupants.some(b=>groupFor(b)?.id!==g.id))fail('Un grupo aislado no puede convivir con otros grupos.');
  }
  const projected=animals.map(a=>candidates.find(c=>Number(c.id_ganado)===Number(a.id_ganado))||a);
  for(const g of management.groups||[]){
    if(!g.motherCalf||!g.animalIds.some(i=>changing.has(i)))continue;
    const members=projected.filter(a=>g.animalIds.includes(Number(a.id_ganado)));
    if(!members.some(a=>a.categoria==='VACA')||!members.some(a=>a.categoria==='TERNERO')||members.some(a=>!['VACA','TERNERO'].includes(a.categoria)))fail('La edición dejaría inválido el grupo madre-cría. Revisá sus integrantes.');
  }
}

async function lockFarm(id,t){
 const {sequelize}=require('../database/sequelize');
 const {QueryTypes}=require('sequelize');
 for(const sql of ['SELECT id_estancia FROM estancia WHERE id_estancia=:id FOR UPDATE','SELECT id_potrero FROM potrero WHERE id_estancia=:id ORDER BY id_potrero FOR UPDATE','SELECT id_ganado FROM ganado WHERE id_estancia=:id ORDER BY id_ganado FOR UPDATE'])await sequelize.query(sql,{replacements:{id},type:QueryTypes.SELECT,transaction:t});
}
async function checkPlacement(id,pid,candidates,t,{locked=false}={}){
 if(!locked)await lockFarm(id,t);
 const {sequelize}=require('../database/sequelize');const {QueryTypes}=require('sequelize');
 const [p]=await sequelize.query('SELECT id_potrero,activo,habilitado_ganado FROM potrero WHERE id_estancia=:id AND id_potrero=:pid',{replacements:{id,pid},type:QueryTypes.SELECT,transaction:t});
 const {animals,management}=await require('./management').snapshot(id,t);
 validatePlacement(p,candidates,animals,management);
}
module.exports={validatePlacement,checkPlacement,lockFarm};
