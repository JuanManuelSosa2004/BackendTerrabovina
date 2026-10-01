'use strict';
const {day,fail}=require('./rules');
// Independent replay of Python's output before persisting an executable proposal.
module.exports=function verify(data,result){
 const bad=()=>fail('La respuesta del planificador no supera la verificación de restricciones.',503);
 const {paddocks:ps,units:us,horizon:h,start}=data,assignment=result.assignment;
 if(!assignment||Object.keys(assignment).length!==us.length)bad();
 for(const u of us)if(!Array.isArray(assignment[u.id])||assignment[u.id].length!==h)bad();
 const stocks=ps.map(p=>p.stock),occupied=ps.map(p=>us.some(u=>u.origin===p.id)),stay=ps.map(p=>p.occupied_days),rest=ps.map(p=>p.rested_days),steps=[];
 for(let d=0;d<h;d++){
  for(const u of us){
   const dest=assignment[u.id][d],j=ps.findIndex(p=>p.id===dest),previous=d?assignment[u.id][d-1]:u.origin;
   if(j<0||!u.allowed[j][d]||!ps[j].available[d]||(u.fixed&&dest!==u.origin))bad();
   if(dest!==previous)steps.push({id:`${u.id}:${d}`,date:day(start,d),origin:previous,destination:dest,animals:u.animals});
  }
  for(let j=0;j<ps.length;j++){
   const p=ps[j],members=us.filter(u=>assignment[u.id][d]===p.id),active=members.length>0,demand=members.reduce((n,u)=>n+u.demand,0);
   if(active&&!occupied[j]&&rest[j]<p.rest)bad();
   stay[j]=active?(occupied[j]?stay[j]+1:1):0;
   if(stay[j]>p.max_stay)bad();
   rest[j]=active?0:(occupied[j]?1:rest[j]+1);occupied[j]=active;
   for(const a of members)for(const b of members)if(a!==b&&a.incompatible.includes(b.group))bad();
   stocks[j]+=p.growth-demand;
   if(stocks[j]<-0.001||(active&&stocks[j]<p.reserve-0.001))bad();
   const projected=result.projection?.filter(r=>r.paddock===p.id&&r.date===day(start,d));
   if(projected?.length!==1||Math.abs(projected[0].stock-stocks[j])>0.011||Math.abs(projected[0].demand-demand)>0.011)bad();
  }
 }
 if(result.projection?.length!==ps.length*h||result.steps.length!==steps.length)bad();
 for(const step of steps){const saved=result.steps.filter(s=>s.id===step.id);if(saved.length!==1)bad();for(const k of ['date','origin','destination'])if(saved[0][k]!==step[k])bad();if(JSON.stringify(saved[0].animals)!==JSON.stringify(step.animals))bad();}
 return true;
};
