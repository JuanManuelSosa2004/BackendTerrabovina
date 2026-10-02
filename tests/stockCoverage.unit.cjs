const { test } = require('node:test');
const assert = require('node:assert/strict');
process.env.MODEL_API_BASE_URL = 'http://model.test';
const http = require('../src/services/stockHttp');
const { predictStock } = require('../src/services/modeloPredictivo.client');
const jobs = require('../src/services/stockJobs');

test('unsupported coverage retains domain code through the asynchronous stock job', async t => {
  t.mock.method(http, 'postStockJson', async () => ({ status: 422, text: JSON.stringify({
    estado: 'NO_CALCULABLE', codigo: 'COBERTURA_NO_COMPATIBLE', error: 'Cobertura no compatible.'
  }) }));
  const job = jobs.start(900001, () => predictStock({}));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(job.estado, 'ERROR');
  assert.equal(job.codigo, 'COBERTURA_NO_COMPATIBLE');
  assert.equal(job.error, 'Cobertura no compatible.');
  assert.equal(job.resultado, undefined);
});

test('source outages remain technical errors instead of unsupported coverage', async t => {
  t.mock.method(http, 'postStockJson', async () => ({ status: 502, text: '{"error":"MapBiomas no disponible"}' }));
  await assert.rejects(predictStock({}), e => e.status === 502 && !e.code);
});
