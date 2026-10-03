const test=require('node:test'),assert=require('node:assert/strict');
const {recommend}=require('../src/rotation/paddockEngine');
const response={version:'rotacion_por_potrero_v3',engineRuntime:'python',priorityModel:'prioridad_sugeno_v1',horizon:7,
 paddocks:[],recommendations:[],partial:false,totals:{excessPaddocks:0,closedPaddocks:0,toMove:0,allocated:0,pending:0}};

test('calls only the Flask recommendation endpoint and returns its result',async t=>{
 const old=process.env.MODEL_API_BASE_URL;process.env.MODEL_API_BASE_URL='http://flask:5000/';
 t.after(()=>old===undefined?delete process.env.MODEL_API_BASE_URL:process.env.MODEL_API_BASE_URL=old);
 const mock=t.mock.method(global,'fetch',async(url,options)=>{
  assert.equal(url,'http://flask:5000/rotation/recommendations');assert.equal(options.method,'POST');
  assert.deepEqual(JSON.parse(options.body),{paddocks:[]});assert.ok(options.signal);
  return {ok:true,json:async()=>response};
 });
 assert.deepEqual(await recommend([]),response);assert.equal(mock.mock.callCount(),1);
});
test('missing config, network failure, bad JSON and incompatible response fail safely without JS inference',async t=>{
 const old=process.env.MODEL_API_BASE_URL;t.after(()=>old===undefined?delete process.env.MODEL_API_BASE_URL:process.env.MODEL_API_BASE_URL=old);
 delete process.env.MODEL_API_BASE_URL;await assert.rejects(()=>recommend([]),{status:503});
 process.env.MODEL_API_BASE_URL='http://flask:5000';
 const mock=t.mock.method(global,'fetch');
 for(const fn of [async()=>{throw Error('timeout')},async()=>({ok:false}),async()=>({ok:true,json:async()=>{throw Error('bad JSON')}}),
  async()=>({ok:true,json:async()=>({...response,engineRuntime:'javascript'})}),
  async()=>({ok:true,json:async()=>({...response,paddocks:[{id:999}]})})]) {
  mock.mock.mockImplementation(fn);await assert.rejects(()=>recommend([]),{status:503});
 }
});
