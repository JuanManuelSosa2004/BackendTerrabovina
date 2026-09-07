const {test} = require('node:test');
const assert = require('node:assert/strict');
const {fechaIngreso} = require('../src/utils/diasPrevios');
const {consumptionForDay} = require('../src/services/stockDaily.service');
test('migración aditiva solo crea la columna cuando falta', async () => {
  const migration = require('../src/database/migrations/20260907000001-asignacion-dmi-ingreso');
  let adds = 0;
  const q = {describeTable:async()=>({}), addColumn:async(table,column)=>{assert.equal(table,'asignacion_ganado');assert.equal(column,'dmi_ingreso_kg_dia');adds++;}};
  await migration.up(q,{DECIMAL:()=> 'decimal'});
  q.describeTable = async()=>({dmi_ingreso_kg_dia:{}});
  await migration.up(q,{DECIMAL:()=> 'decimal'});
  assert.equal(adds,1);
});
test('conserva una solicitud de refresco inmediatamente posterior al inicio', async () => {
  const jobs = require('../src/services/stockJobs');
  jobs.start(988,async()=> 'viejo');
  jobs.start(988,async()=> 'nuevo',true);
  await new Promise(r=>setImmediate(r));
  assert.equal(jobs.get(988).resultado,'nuevo');
});
test('entrada con días enteros y medianoche argentina', () => {
  const now = new Date('2026-09-07T01:00:00Z');
  assert.equal(fechaIngreso(0,now),'2026-09-06');
  assert.equal(fechaIngreso(3,now),'2026-09-03');
  for (const n of [-1,0.5,'3',null,Infinity,36501]) assert.throws(()=>fechaIngreso(n,now));
});
test('tres días previos descuentan tres DMI de ingreso sin usar el promedio de otro rodeo', () => {
  const a = [{id_ganado:1,fecha_desde:'2026-09-04 03:00:00',created_at:'2026-09-07 03:00:00',dmi_ingreso_kg_dia:10}];
  const ds = [{id_estimacion:1,fecha_calculo:'2026-09-01 03:00:00',cantidad_animales:1,kg_materia_seca_dia:50},
    {id_estimacion:2,fecha_calculo:'2026-09-07 03:00:00',cantidad_animales:1,kg_materia_seca_dia:12}];
  const calculate = () => ['04','05','06'].reduce((sum,d)=>sum+consumptionForDay('2026-09-'+d,a,ds).kg_ms,0);
  assert.equal(calculate(),30);
  assert.equal(calculate(),30);
  assert.equal(consumptionForDay('2026-09-03',a,ds).kg_ms,0);
  assert.equal(consumptionForDay('2026-09-07',a,ds).kg_ms,12);
});
test('la fecha de salida limita también el consumo retrospectivo', () => {
  const a = [{id_ganado:1,fecha_desde:'2026-09-04 03:00:00',fecha_hasta:'2026-09-05 15:00:00',created_at:'2026-09-07 03:00:00',dmi_ingreso_kg_dia:10}];
  assert.equal(consumptionForDay('2026-09-05',a,[]).kg_ms,5);
  assert.equal(consumptionForDay('2026-09-06',a,[]).kg_ms,0);
});
test('encola una nueva corrida si cambia el ganado durante el cálculo', async () => {
  const jobs = require('../src/services/stockJobs');
  let resolve;
  const first = new Promise(r=>{resolve=r;});
  jobs.start(987,()=>first);
  await new Promise(r=>setImmediate(r));
  jobs.start(987,async()=> 'saldo nuevo',true);
  resolve('saldo viejo');
  await new Promise(r=>setImmediate(r));
  assert.equal(jobs.get(987).resultado,'saldo nuevo');
});
