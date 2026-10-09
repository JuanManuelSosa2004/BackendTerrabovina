const {test}=require('node:test'),assert=require('node:assert/strict');
test('herds over 1000 animals are partitioned without losing ids or warnings',async()=>{
 process.env.MODEL_API_BASE_URL='http://model.test';
 const original=global.fetch,calls=[];
 global.fetch=async(_url,options)=>{const body=JSON.parse(options.body);calls.push(body.animales.length);return {ok:true,text:async()=>JSON.stringify({predicciones:body.animales.map(a=>({animal_id:a.animal_id,dmi_kg_dia:10})),advertencias:['domain warning']})};};
 try{
  const {predictDmi}=require('../src/services/modeloPredictivo.client');
  const animals=Array.from({length:2501},(_,i)=>({animal_id:String(i)}));
  const r=await predictDmi({animales:animals});
  assert.deepEqual(calls,[1000,1000,501]);assert.deepEqual(r.predicciones.map(p=>p.animal_id),animals.map(a=>a.animal_id));assert.deepEqual(r.advertencias,['domain warning']);
  let n=0;global.fetch=async()=>{if(++n===2)throw Error('offline');return {ok:true,text:async()=>JSON.stringify({predicciones:[],advertencias:[]})};};
  await assert.rejects(predictDmi({animales:animals}),/No se pudo/);
 }finally{global.fetch=original;}
});
