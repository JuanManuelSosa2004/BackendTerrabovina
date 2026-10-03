const test = require('node:test');
const assert = require('node:assert/strict');
const {evaluatePriority:evaluate} = require('../src/rotation/fuzzyPriority');
const {recommend} = require('../src/rotation/paddockEngine');
const p = (id,stock,growth,animals=10) => ({id,name:`P${id}`,stock,growth,animals,demand:animals*10,included:true,issues:[]});

test('Sugeno blends overlapping rules instead of applying a binary threshold',()=>{
  const result=evaluate(p(1,500,100));
  assert.equal(result.score,55);
  assert.equal(result.rules.length,4);
  assert.equal(result.level,'MEDIA');
  assert.equal(evaluate(p(1,0,0)).level,'ALTA');
  assert.equal(evaluate(p(1,2000,200)).level,'BAJA');
});
test('more pressure never reduces urgency; more reserve never increases it',()=>{
  for(let days=0;days<=20;days+=.25) {
    let prior=-Infinity;
    for(let ratio=.2;ratio<=3;ratio+=.025) {
      const score=evaluate(p(1,days*100,100/ratio)).score;
      assert.ok(score>=prior);assert.ok(score>=20&&score<=90);prior=score;
    }
  }
  for(let ratio=.2;ratio<=3;ratio+=.1) {
    let prior=Infinity;
    for(let days=0;days<=20;days+=.1) {
      const score=evaluate(p(1,days*100,100/ratio)).score;
      assert.ok(score<=prior);prior=score;
    }
  }
});
test('no fabricated confidence for missing data, empty herd or invalid inputs',()=>{
  for(const change of [{stock:null},{growth:NaN},{demand:0},{animals:0},{issues:['Actualizar']},{growth:-1}])
    assert.equal(evaluate({...p(1,100,20),...change}),null);
  const zero=evaluate(p(1,-500,0));
  assert.equal(zero.inputs.reserveDays,0);assert.equal(zero.inputs.zeroGrowth,true);
  assert.equal(zero.inputs.pressureRatio,null);assert.ok(!JSON.stringify(zero).includes('Infinity'));
});
test('scale and input order do not change priorities or final recommendations',()=>{
  const a=p(1,300,50);const b={...a,stock:3000,growth:500,demand:1000,animals:100};
  assert.deepEqual(evaluate(a),evaluate(b));
  const data=[p(1,0,95),p(2,670,0),p(3,70,0,0)];
  assert.deepEqual(recommend(data).recommendations,recommend([...data].reverse()).recommendations);
});
test('priority actually changes who receives scarce capacity without changing withdrawal amounts',()=>{
  const r=recommend([p(1,0,95),p(2,670,0),p(3,70,0,0)]);
  assert.deepEqual(r.recommendations.map(x=>x.origin),[2,1]);
  assert.deepEqual(r.recommendations.map(x=>x.remove),[1,1]);
  assert.equal(r.recommendations[0].allocated,1);assert.equal(r.recommendations[1].unallocated,1);
  assert.equal(r.paddocks.find(x=>x.id===3).projectedDemand,10);
});
test('user closure outranks fuzzy scores; stale/excluded data get no fuzzy label',()=>{
  const r=recommend([{...p(1,0,0),enabled:false},p(2,0,0),p(3,700,0,0),{...p(4,0,0),included:false},{...p(5,0,0),issues:['Actualizar']}]);
  assert.equal(r.recommendations[0].origin,1);assert.equal(r.recommendations[0].priority,null);
  assert.equal(r.paddocks.find(p=>p.id===4).priority,null);
  assert.equal(r.paddocks.find(p=>p.id===5).priority,null);
  assert.equal(r.recommendations[0].allocated,10);
});
