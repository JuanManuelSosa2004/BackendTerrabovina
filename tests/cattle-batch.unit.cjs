const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createBatch}=require('../src/services/cattleBatch');
function setup(fail=false) {
  let saved=[],refreshes=0,predictions=0;
  const d={validate:()=>null,entryDate:()=> '2026-08-08',mapAnimal:x=>x,
    predict:async({animales})=>{predictions++;return {predicciones:animales.map(a=>({animal_id:a.id_ganado,dmi_kg_dia:5}))};},
    transaction:async fn=>{const before=[...saved];try{return await fn({});}catch(e){saved=before;throw e;}},lock:async()=>{},count:async()=>0,
    create:async a=>{if(fail&&saved.length===1)throw Error('fallo');const x={...a,id_ganado:saved.length+1};saved.push(x);return x;},assign:async()=>{},refresh:()=>{refreshes++;return {estado:'EJECUTANDO'};}};
  return {d,stats:()=>({saved,refreshes,predictions})};
}
test('50 animales: una predicción por lote y un refresco después de guardar',async()=>{
  const {d,stats}=setup();await createBatch({animals:Array.from({length:50},()=>({})),potrero:{id_potrero:48,id_estancia:42}},d);
  assert.equal(stats().saved.length,50);assert.equal(stats().refreshes,1);assert.equal(stats().predictions,1);
});
test('fallo intermedio revierte lote sin refrescar',async()=>{
  const {d,stats}=setup(true);await assert.rejects(createBatch({animals:[{},{}],potrero:{id_potrero:48,id_estancia:42}},d));
  assert.equal(stats().saved.length,0);assert.equal(stats().refreshes,0);
});
test('DMI incompleto no guarda animales',async()=>{
  const {d,stats}=setup();d.predict=async()=>({predicciones:[]});
  await assert.rejects(createBatch({animals:[{}],potrero:{id_potrero:48}},d));assert.equal(stats().saved.length,0);
});
