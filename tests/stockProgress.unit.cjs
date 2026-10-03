const {test}=require('node:test');
const assert=require('node:assert/strict');
const jobs=require('../src/services/stockJobs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('progress is monotonic, shared with resumed clients and reaches 100 only after success',async()=>{
 let release;
 const job=jobs.start(980001,async report=>{report(37);report(12);report(NaN);report(100);await new Promise(r=>release=r);return {saved:true};});
 await tick();
 assert.equal(jobs.get(980001).porcentaje,99);
 assert.equal(job.estado,'EJECUTANDO');
 assert.equal(jobs.start(980001,()=>{throw Error('duplicate');}),job);
 release();await tick();
 assert.equal(job.porcentaje,100);assert.equal(job.estado,'COMPLETADO');
});
test('a failed calculation does not claim completion',async()=>{
 const job=jobs.start(980002,async report=>{report(45);throw Error('Source failed');});
 await tick();assert.equal(job.estado,'ERROR');assert.equal(job.porcentaje,45);
});
