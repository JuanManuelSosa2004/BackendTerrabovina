const test=require('node:test'),assert=require('node:assert/strict');
let writes=0;
const stub=(path,exports)=>{const id=require.resolve(path);require.cache[id]={id,filename:id,loaded:true,exports};};
stub('../src/database/sequelize',{sequelize:{transaction:async fn=>fn({})}});
stub('../src/database/sql/ganado.repository',{
 getGanadoById:async()=>({id_ganado:1,categoria:'TERNERO',sexo:'M',peso_kg:90}),
 createGanado:async()=>{writes++;},updateGanado:async()=>{writes++;},
 getGanadoDeUsuario:async()=>({id_ganado:1}),
});
const c=require('../src/controllers/ganado.controller');
const res=()=>({statusCode:200,status(n){this.statusCode=n;return this;},json(data){this.data=data;return this;}});
test('creation rejects invalid enums before calling the database',async()=>{
 for(const patch of [{sexo:'X'},{categoria:'CABALLO'},{estado_fisiologico:'INVALIDO'},{fecha_nacimiento:'2026-02-31'}]){
  const r=res();await c.createEnEstancia({body:{numero_identificacion:'QA',categoria:'TERNERO',sexo:'M',peso_kg:90,...patch}},r);
  assert.equal(r.statusCode,400);assert.ok(r.data.error);
 }
 assert.equal(writes,0);
});
test('date-only and physiology-only edits are also validated individually and in a batch',async()=>{
 for(const patch of [{estado_fisiologico:'INVALIDO'},{fecha_nacimiento:'2026-02-31'}]){
  const single=res();await c.update({ganado:{id_ganado:1},body:patch},single);assert.equal(single.statusCode,400);
  const batch=res();await c.updateMultiple({usuario:{id_usuario:26},body:{ganado:[{id_ganado:1,...patch}]}},batch);assert.equal(batch.statusCode,400);
 }
 assert.equal(writes,0);
});
