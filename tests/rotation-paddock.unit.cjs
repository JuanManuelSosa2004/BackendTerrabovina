const test=require('node:test'),assert=require('node:assert/strict');
const {recommend}=require('../src/rotation/paddockEngine');
const p=(id,animals,stock,growth=0,average=10)=>({id,name:`P${id}`,animals,stock,growth,demand:animals*average,included:true,issues:[]});
test('quantity-only proposal relieves overload across multiple destinations',()=>{
 const r=recommend([p(1,20,700),p(2,0,420),p(3,0,280)]);
 assert.equal(r.totals.toMove,10);assert.equal(r.totals.allocated,10);assert.equal(r.totals.pending,0);
 assert.deepEqual(r.recommendations[0].destinations.map(d=>d.quantity).sort(),[4,6]);
 assert.equal(r.paddocks.reduce((s,p)=>s+p.projectedAnimals,0),20);
});
test('shared destination is never overbooked by multiple source paddocks',()=>{
 const r=recommend([p(1,20,700),p(2,20,700),p(3,0,1050)]);
 assert.equal(r.totals.allocated,15);assert.equal(r.totals.pending,5);
 assert.equal(r.paddocks[2].projectedAnimals,15);assert.ok(r.paddocks[2].projectedBalance>=0);
});
test('receiver demand uses source average rather than receiver average',()=>{
 const r=recommend([p(1,10,350,0,20),p(2,10,1050,0,5)]);
 assert.equal(r.totals.toMove,8);assert.equal(r.totals.allocated,5);
 assert.equal(r.paddocks[1].projectedDemand,150);
});
test('excluded and missing-data paddocks are neither donors nor receivers',()=>{
 const r=recommend([p(1,20,700),{...p(2,0,700),included:false},{...p(3,0,700),stock:null}]);
 assert.equal(r.totals.allocated,0);assert.equal(r.totals.pending,10);assert.equal(r.partial,true);
 assert.equal(r.paddocks[1].status,'EXCLUIDO');assert.equal(r.paddocks[2].status,'SIN_DATOS');
});
test('negative historical balances are explicit and do not create fictitious capacity',()=>{
 const r=recommend([p(1,10,-500,20),p(2,0,-100)]);
 assert.equal(r.totals.toMove,8);assert.equal(r.totals.allocated,0);assert.equal(r.paddocks[0].stock,-500);
 assert.equal(r.paddocks[1].capacity,0);assert.equal(r.paddocks[0].pressure,500);
});
test('empty, balanced and zero-growth paddocks require no individual DMI',()=>{
 const r=recommend([p(1,10,700),p(2,0,0)]);assert.equal(r.totals.toMove,0);assert.equal(r.partial,false);
});
test('no limit of 80 animals or units in the aggregate comparison',()=>{
 const r=recommend([p(1,1000,35000),p(2,0,35000)]);assert.equal(r.totals.allocated,500);
});
test('deterministic multi-source replay conserves headcount and receiver budgets',()=>{
 for(let i=1;i<=70;i++){
  const inputs=[p(1,30,150+i,2,5+i/20),p(2,45,500+i,4,8),p(3,3,900+i*4,10,6),p(4,0,1300+i*9,8)];
  const r=recommend(inputs);assert.equal(r.paddocks.reduce((s,p)=>s+p.projectedAnimals,0),78);
  for(const dest of r.paddocks.filter(p=>p.incoming))assert.ok(dest.projectedDemand<=dest.capacity+.011);
  for(const source of r.recommendations)assert.equal(source.allocated+source.unallocated,source.remove);
 }
});
