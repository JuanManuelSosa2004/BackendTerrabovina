const test = require('node:test');
const assert = require('node:assert/strict');
let writes = 0;
const stub = (path, exports) => {
  const id = require.resolve(path);
  require.cache[id] = { id, filename: id, loaded: true, exports };
};
stub('../src/database/sequelize', { sequelize: {} });
stub('../src/database/sql/potrero.repository', {
  updatePotrero: async () => { writes++; return { activo: false }; },
});
const controller = require('../src/controllers/potrero.controller');
test('ordinary editing cannot bypass confirmed deletion or resurrect a paddock', async () => {
  for (const activo of [false, true, 'false', null]) {
    const res = { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(data) { this.data = data; return this; } };
    await controller.update({ potrero: { id_potrero: 1, id_estancia: 1 }, body: { activo } }, res);
    assert.equal(res.statusCode, 400);
    assert.ok(res.data.error);
  }
  assert.equal(writes, 0);
});
