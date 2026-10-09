const {test}=require('node:test'),assert=require('node:assert/strict');
const {validatePlacement}=require('../src/rotation/placement');
const cats=['TERNERO','VAQUILLONA','NOVILLO','VACA','TORO'];
const p={id_potrero:1,activo:1,habilitado_ganado:1};
const m={paddocks:{},groups:[],split:{}};
test('all category pairs and service settings agree with husbandry policy',()=>{
 for(const a of cats)for(const b of cats)for(const service of [false,true]){
  const cfg={...m,paddocks:{1:{categories:cats,service}}};
  const run=()=>validatePlacement(p,[{categoria:a}],[{id_ganado:1,origin:1,categoria:b}],cfg);
  const blocked=[a,b].includes('TORO')&&([a,b].includes('TERNERO')||(!service&&[a,b].some(c=>['VACA','VAQUILLONA'].includes(c))));
  if(blocked)assert.throws(run,{status:422});else assert.doesNotThrow(run);
 }
});
test('intake and first assignment enforce closed paddocks, categories and isolation',()=>{
 assert.throws(()=>validatePlacement({...p,habilitado_ganado:0},[{categoria:'NOVILLO'}],[],m),/fuera de uso/);
 assert.throws(()=>validatePlacement(p,[{categoria:'TORO'}],[],{...m,paddocks:{1:{categories:['NOVILLO']}}}),/categorías/);
 const cfg={...m,groups:[{id:'g',animalIds:[1],isolated:true}]};
 assert.throws(()=>validatePlacement(p,[{categoria:'NOVILLO'}],[{id_ganado:1,origin:1,categoria:'NOVILLO'}],cfg),/aislado/);
 assert.doesNotThrow(()=>validatePlacement(p,[{id_ganado:1,categoria:'NOVILLO'}],[{id_ganado:1,origin:1,categoria:'NOVILLO'}],cfg));
});
test('category edits cannot silently break mother-calf groups; simultaneous compatible edits work',()=>{
 const herd=[{id_ganado:1,origin:1,categoria:'VACA'},{id_ganado:2,origin:1,categoria:'TERNERO'}];
 const cfg={...m,groups:[{id:'g',animalIds:[1,2],motherCalf:true}]};
 assert.throws(()=>validatePlacement(p,[{id_ganado:2,categoria:'NOVILLO'}],herd,cfg),/madre-cría/);
 assert.doesNotThrow(()=>validatePlacement(p,[{id_ganado:1,categoria:'TERNERO'},{id_ganado:2,categoria:'VACA'}],herd,cfg));
});
