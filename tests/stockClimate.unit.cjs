const {test} = require('node:test');
const assert = require('node:assert/strict');
const {latestClimate, persistStockClimate} = require('../src/services/stockClimate.service');
const climate = (fecha, extra={}) => ({fecha, fuente:'OPEN_METEO_ARCHIVE', temperatura:-2.5, precipitacion:0, humedad:65, ...extra});
const dmp = data => ({periodos:[{dmp_actual: data ? {clima:data} : null}]});

test('uses latest current observation across incremental blocks, never a comparison year', () => {
  const result = {dmp:dmp(climate('2026-09-30')), seguimiento_diario:{observaciones:[{detalle_dmp:dmp(climate('2026-10-01'))}]}};
  result.dmp.periodos[0].dmp_historico = {observaciones:[{clima:climate('2026-10-03')}]};
  assert.equal(latestClimate(result).fecha, '2026-10-01');
  assert.equal(latestClimate({dmp:{periodos:[{dmp_actual:null, dmp_historico:result.dmp.periodos[0].dmp_historico}]}}), null);
});
test('regional and legacy results create no invented climate', () => {
  assert.equal(latestClimate({}), null);
  assert.equal(latestClimate({dmp:dmp(null)}), null);
  assert.equal(latestClimate({dmp:{periodos:[{dmp_actual:{clima_fecha:'2026-10-01'}}]}}), null);
});
test('validates dates and values, preserving zero rain and negative temperatures', () => {
  assert.deepEqual(latestClimate({dmp:dmp(climate('2026-10-01', {humedad:NaN}))}), climate('2026-10-01', {humedad:null}));
  for (const fecha of ['2026-02-30', 'today', null]) assert.equal(latestClimate({dmp:dmp(climate(fecha))}), null);
  assert.equal(latestClimate({potrero:{fecha_objetivo:'2026-09-30'},dmp:dmp(climate('2026-10-01'))}), null);
});
test('persists in stock transaction and does not duplicate carried-forward weather', async () => {
  const transaction = {};
  let previous = null, writes = 0;
  const repository = {
    async getUltimoByPotrero(id, tx) {assert.equal(id,93);assert.equal(tx,transaction);return previous;},
    async crearDato(data, tx) {assert.equal(tx,transaction);writes++; previous={...data,temperatura:String(data.temperatura)};return previous;}
  };
  const result = {dmp:dmp(climate('2026-10-01'))};
  await persistStockClimate(93,result,transaction,repository);
  await persistStockClimate(93,result,transaction,repository);
  await persistStockClimate(93,{dmp:dmp(climate('2026-09-29'))},transaction,repository);
  await persistStockClimate(93,{dmp:dmp(null)},transaction,repository);
  assert.equal(writes,1);
  assert.equal(previous.fecha,'2026-10-01');
  await persistStockClimate(93,{dmp:dmp(climate('2026-10-02'))},transaction,repository);
  assert.equal(writes,2);
});
