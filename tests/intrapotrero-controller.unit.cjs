const {test,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const stub=(path,exports)=>{require.cache[require.resolve(path)]={id:require.resolve(path),filename:require.resolve(path),loaded:true,exports};};
let current,saved,invalid,geom={type:'Polygon',coordinates:[]};
class ModeloPredictivoError extends Error{constructor(status){super('source');this.status=status;this.detail=JSON.stringify({error:'Fuera del potrero'});}}
stub('../src/database/sequelize',{sequelize:{transaction:async fn=>fn({}),query:async()=>[]}});
stub('../src/database/sql/intrapotrero.repository',{
 latest:async()=>current,history:async()=>current?[current]:[],
 create:async data=>{saved=data;return {...data,id:9};}});
stub('../src/database/sql/potrero.repository',{getPotreroById:async()=>({id_potrero:7,activo:1,geom})});
stub('../src/database/sql/estimacionStock.repository',{getUltimaByPotrero:async()=>null});
stub('../src/database/sql/ganado.repository',{getGanadoByPotrero:async()=>[]});
stub('../src/services/modeloPredictivo.client',{ModeloPredictivoError,analyzeIntrapaddock:async data=>{
 if(invalid)throw new ModeloPredictivoError(invalid);return {configuracion:data.configuracion,fecha:data.fecha};}});
const controller=require('../src/controllers/intrapotrero.controller');
const req=body=>({potrero:{id_potrero:7},usuario:{id_usuario:3},body});
const response=()=>({statusCode:200,status(v){this.statusCode=v;return this;},json(d){this.data=d;return this;}});
beforeEach(()=>{current=null;saved=null;invalid=0;});
test('rejects invalid geometry without storing a version',async()=>{
 invalid=422;const res=response();await controller.save(req({version_base:0,zonas:[]}),res);
 assert.equal(res.statusCode,422);assert.equal(saved,null);
});
test('concurrent stale editor cannot overwrite a saved version',async()=>{
 current={id:8};const res=response();await controller.save(req({version_base:0,zonas:[]}),res);
 assert.equal(res.statusCode,409);assert.equal(saved,null);
});
test('stores author and server date, ignoring client supplied analysis',async()=>{
 const res=response();await controller.save(req({version_base:0,zonas:[],analisis:{factor_mensual:[999]},vigente_desde:'2000-01-01'}),res);
 assert.equal(res.statusCode,201);assert.equal(saved.id_usuario,3);assert.equal(saved.id_potrero,7);
 assert.notEqual(saved.vigente_desde,'2000-01-01');assert.equal(saved.analisis.factor_mensual,undefined);
});
test('unavailable model returns saved data explicitly stale',async()=>{
 current={id:8,geometria_potrero:geom,configuracion:{zonas:[]},analisis:{fecha:'2026-09-25'}};invalid=503;
 const res=response();await controller.get(req(),res);
 assert.equal(res.statusCode,200);assert.equal(res.data.sin_actualizar,true);assert.equal(res.data.resumen,undefined);
 assert.equal(res.data.analisis.fecha,'2026-09-25');assert.equal(saved,null);
});
