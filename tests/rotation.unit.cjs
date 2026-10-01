const test=require('node:test'),assert=require('node:assert/strict');
const R=require('../src/rotation/rules');
const base=()=>{
 const a={id_ganado:1,peso_kg:'300',categoria:'NOVILLO',condicion_corporal:null,estado_fisiologico:'N',sexo:'M',origin:1};a.demand={kg:8,hash:R.animalHash(a),date:'2026-10-01'};
 return {start:'2026-10-01',animals:[a],assignments:[{id_potrero:1,fecha_desde:'2026-09-29',fecha_hasta:null}],paddocks:[{id_potrero:1,nombre:'Uno',superficie_ha:10,offer:{stock:100,growth:10,area:10,date:'2026-10-01'}}],config:{horizon:3,conservative:false,groups:[{id:'g',name:'Grupo',animals:[1],split:false,selected:true,destinations:[],incompatible:[],lock_until:''}],paddocks:{1:{rest:3,max_stay:5,reserve_ha:2,water:true,water_date:'2026-10-01'}}}};
};
test('whole groups and animal demand',()=>{const s=base(),r=R.infer(s);assert.deepEqual(r.issues,[]);assert.equal(r.input.units[0].demand,8);assert.deepEqual(r.input.units[0].animals,[1]);});
test('disabled group keeps demand and location',()=>{const s=base();s.config.groups[0].selected=false;const u=R.infer(s).input.units[0];assert.equal(u.fixed,true);assert.equal(u.demand,8);});
test('exclusion inclusive and temporary',()=>{const s=base();Object.assign(s.config.paddocks[1],{excluded_from:'2026-10-01',excluded_until:'2026-10-02'});assert.deepEqual(R.infer(s).input.paddocks[0].available,[false,false,true]);});
test('missing offer blocks plan',()=>{const s=base();s.paddocks[0].offer=null;assert.ok(R.infer(s).issues.some(x=>x.includes('oferta')));});
test('changed weight invalidates demand',()=>{const s=base();s.animals[0].peso_kg='350';assert.ok(R.infer(s).issues.some(x=>x.includes('DMI')));});
test('different origins require explicit split',()=>{const s=base();s.animals.push({...s.animals[0],id_ganado:2,origin:2});s.config.groups[0].animals.push(2);assert.ok(R.infer(s).issues.some(x=>x.includes('distintos')));s.config.groups[0].split=true;assert.equal(R.infer(s).input.units.length,2);});
test('overlapping occupancy is merged, group replacement is not rest',()=>{const o=R.occupancy({id_potrero:1},[{id_potrero:1,fecha_desde:'2026-09-20',fecha_hasta:'2026-09-25'},{id_potrero:1,fecha_desde:'2026-09-25',fecha_hasta:null}],'2026-10-01');assert.equal(o.occupied_days,11);});
test('foreign members rejected and dates validated',()=>{const s=base();s.config.groups[0].animals=[99];assert.throws(()=>R.validateConfig(s.config,s.paddocks,s.animals));assert.equal(R.validDate('2026-02-30'),false);});
test('conservative scenario is deterministic',()=>{const s=base();s.config.conservative=true;assert.equal(R.infer(s).input.paddocks[0].growth,8);});
test('independent verifier rejects changed destinations',()=>{assert.throws(()=>require('../src/rotation/verify')({start:'2026-10-01',horizon:1,paddocks:[],units:[{id:'g'}]},{assignment:{g:[99]},steps:[],projection:[]}));});
