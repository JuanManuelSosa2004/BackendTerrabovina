const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

test('DMI timeout includes a response body that never finishes', async t => {
  const server = http.createServer((_req, res) => { res.writeHead(200); res.write('{'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  process.env.MODEL_API_BASE_URL = `http://127.0.0.1:${server.address().port}`;
  process.env.MODEL_API_TIMEOUT_MS = '100';
  const { predictDmi, ModeloPredictivoError } = require('../src/services/modeloPredictivo.client');
  const started = Date.now();
  await assert.rejects(predictDmi({ animales: [] }), error => error instanceof ModeloPredictivoError);
  assert.ok(Date.now() - started < 2000);
});

test('invalid model JSON is reported as a controlled model error', async t => {
  const server = http.createServer((_req, res) => res.end('<html>bad gateway</html>'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  process.env.MODEL_API_BASE_URL = `http://127.0.0.1:${server.address().port}`;
  delete require.cache[require.resolve('../src/services/modeloPredictivo.client')];
  const { predictDmi, ModeloPredictivoError } = require('../src/services/modeloPredictivo.client');
  await assert.rejects(predictDmi({ animales: [] }), error => error instanceof ModeloPredictivoError && /JSON inválido/.test(error.message));
});
