const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

function controller() {
  const calls = { reads: 0, analyses: 0, saved: 0 };
  const tasks = new Map();
  const dependencies = {
    '../database/sql/potrero.repository': { getPotreroById: async () => ({ geom: { type: 'Polygon' } }) },
    '../database/sql/intrapotrero.repository': { get: async () => { calls.reads++; return { id: 'stored' }; }, save: async () => { calls.saved++; } },
    '../services/intrapotrero': { geometryHash: () => 'hash', analyze: async () => { calls.analyses++; return { id: 'new' }; } },
    '../services/stockJobs': { get: id => tasks.get(id) ?? { estado: 'SIN_TAREA' }, start: (id, run) => tasks.set(id, { estado: 'EJECUTANDO', run }) },
  };
  const module = { exports: {} };
  vm.runInNewContext(readFileSync(require.resolve('../src/controllers/intrapotrero.controller'), 'utf8'), {
    module, require: name => { if (!(name in dependencies)) throw new Error(name); return dependencies[name]; }, Set,
  });
  const res = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.data = data; return this; } });
  return { api: module.exports, calls, tasks, res };
}

test('GET only reads persisted observations; POST coalesces duplicate concurrent requests', async () => {
  const { api, calls, tasks, res } = controller();
  const req = { potrero: { id_potrero: 42 } };
  const result = res();
  await api.get(req, result);
  assert.equal(result.data.analysis.id, 'stored');
  assert.equal(calls.analyses, 0);
  await Promise.all([api.refresh(req, res()), api.refresh(req, res())]);
  assert.equal(tasks.size, 1);
  assert.equal(calls.analyses, 0);
  await tasks.get('intrapotrero:42').run();
  assert.equal(calls.analyses, 1);
  assert.equal(calls.saved, 1);
});

test('limits queued analyses without starting additional satellite requests', async () => {
  const { api, tasks, res } = controller();
  await Promise.all([1, 2, 3, 4].map(async id => {
    const response = res();
    await api.refresh({ potrero: { id_potrero: id } }, response);
    if (id === 4) assert.equal(response.statusCode, 429);
  }));
  assert.equal(tasks.size, 3);
});
