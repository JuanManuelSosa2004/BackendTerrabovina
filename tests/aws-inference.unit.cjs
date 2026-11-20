const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

test('AWS retries transient model failures only on the companion container', async (t) => {
  const metadata = http.createServer((_req, res) => res.end(JSON.stringify({
    AccessKeyId: 'test-id', SecretAccessKey: 'test-value', Token: 'test-session',
    Expiration: new Date(Date.now() + 3600000).toISOString(),
  })));
  await new Promise(resolve => metadata.listen(0, '127.0.0.1', resolve));
  t.after(() => { metadata.closeAllConnections(); metadata.close(); });
  process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI = `http://127.0.0.1:${metadata.address().port}/`;
  process.env.MODEL_GATEWAY_URL = 'https://model.example.invalid';
  process.env.MODEL_API_BASE_URL = 'http://127.0.0.1:5000';
  const { predictDmi } = require('../src/services/modeloPredictivo.client');
  const calls = [];
  let gatewayStatus = 503;
  t.mock.method(global, 'fetch', async (url, options) => {
    calls.push(url.origin);
    if (url.origin === process.env.MODEL_GATEWAY_URL) {
      assert.match(options.headers.authorization, /^AWS4-HMAC-SHA256 /);
      return new Response('{}', { status: gatewayStatus });
    }
    assert.equal(options.headers.authorization, undefined);
    return new Response('{"predicciones":[]}');
  });
  assert.deepEqual(await predictDmi({ animales: [] }), { predicciones: [] });
  assert.deepEqual(calls, [process.env.MODEL_GATEWAY_URL, process.env.MODEL_API_BASE_URL]);
  gatewayStatus = 422;
  calls.length = 0;
  await assert.rejects(predictDmi({ animales: [] }), error => error.status === 422);
  assert.deepEqual(calls, [process.env.MODEL_GATEWAY_URL]);
});
