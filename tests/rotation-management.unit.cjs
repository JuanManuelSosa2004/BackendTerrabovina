const test=require('node:test'),assert=require('node:assert/strict');
const {buildGroups,validate}=require('../src/rotation/management');
const {animalHash}=require('../src/rotation/rules');
const animal=(id,category='NOVILLO',origin=1)=>({id_ganado:id,origin,categoria:category,sexo:category==='VACA'?'F':'M',peso_kg:300,condicion_corporal:3,estado_fisiologico:'N',fecha_desde:'2026-01-01'});
const fresh=a=>({...a,kg_dia:10,atributos_hash:animalHash(a),calculado_en:new Date()});
const config=()=>({paddocks:{},groups:[],split:{}});
test('automatic groups use categories and require explicit split permission',()=>{
 const animals=[fresh(animal(1)),fresh(animal(2)),fresh(animal(3,'VACA'))],m=config();
 let groups=buildGroups(animals,m);assert.equal(groups.length,2);assert.equal(groups[0].animals.length,2);assert.equal(groups[0].allowSplit,false);
 m.split['auto:1:NOVILLO']=true;groups=buildGroups(animals,m);assert.equal(groups[0].allowSplit,true);assert.deepEqual(groups[0].issues,[]);
});
test('changing a cattle attribute invalidates its cached demand',()=>{
 const a=fresh(animal(1));a.peso_kg=350;
 const g=buildGroups([a],config())[0];assert.equal(g.animals[0].demand,null);assert.ok(g.issues.length);
});
test('manual group claims members once and mother-calf groups cannot split',()=>{
 const m=config();m.groups=[{id:'group:pair',name:'Familia',animalIds:[1,2],motherCalf:true,isolated:false,allowSplit:false}];
 const animals=[fresh(animal(1,'VACA')),fresh(animal(2,'TERNERO')),fresh(animal(3))];
 validate(m,animals,[{id_potrero:1}]);assert.equal(buildGroups(animals,m).length,2);
 m.groups[0].allowSplit=true;assert.throws(()=>validate(m,animals,[{id_potrero:1}]),/madre-cría/);
});
test('ownership, overlap and category validations reject invalid management',()=>{
 const m=config(),animals=[animal(1)];
 m.paddocks={'9':{categories:['VACA'],service:false}};assert.throws(()=>validate(m,animals,[{id_potrero:1}]));
 m.paddocks={'1':{categories:['CABALLO'],service:false}};assert.throws(()=>validate(m,animals,[{id_potrero:1}]));
 m.paddocks={};m.groups=[{id:'group:a',name:'A',animalIds:[1,1],motherCalf:false,isolated:false,allowSplit:false}];assert.throws(()=>validate(m,animals,[{id_potrero:1}]),/repetidos/);
 m.groups[0].animalIds=[999];assert.throws(()=>validate(m,animals,[{id_potrero:1}]),/ajenos/);
});
test('a previously split group retains its rule at both origins',()=>{
 const m=config();m.groups=[{id:'group:a',name:'A',animalIds:[1,2],motherCalf:false,isolated:false,allowSplit:true}];
 const animals=[fresh(animal(1)),fresh(animal(2,'NOVILLO',2))];
 validate(m,animals,[{id_potrero:1},{id_potrero:2}]);
 assert.equal(buildGroups(animals,m).length,2);
 m.groups[0].allowSplit=false;assert.throws(()=>validate(m,animals,[{id_potrero:1},{id_potrero:2}]),/mismo potrero/);
});
