const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createBoundaryPreview } = require('../src/controllers/estanciaBoundary.controller');
const geom = { type: 'Polygon', coordinates: [[[-58,-30],[-57.99,-30],[-57.99,-29.99],[-58,-30]]] };
async function run(rows, body = { geom }) {
  let queried = false;
  const preview = createBoundaryPreview({ QueryTypes: { SELECT: 'SELECT' }, assertValidPolygon: async () => {}, sequelize: {
    query: async (sql, options) => {
      queried = true;
      assert.match(sql, /ST_Intersection/);
      assert.match(sql, /ST_Intersects/);
      assert.match(sql, /activo = TRUE/);
      assert.match(sql, /LIMIT 201/);
      assert.equal(JSON.parse(options.replacements.polygon).type, 'Polygon');
      return rows;
    },
  } });
  const res = { statusCode: 200, set() {}, status(n) { this.statusCode = n; return this; }, json(data) { this.data = data; return this; } };
  await preview({ body }, res);
  return { ...res, queried };
}
test('conflict preview is anonymous and read-only', async () => {
  const result = await run([{ geom: JSON.stringify(geom), conflicto: 1, nombre: 'Private', id_usuario: 12 }]);
  assert.equal(result.data.disponible, false);
  assert.deepEqual(Object.keys(result.data.zonas[0]), ['geom', 'conflicto']);
});
test('empty nearby area permits preview', async () => assert.equal((await run([])).data.disponible, true));
test('truncated results never claim availability', async () => {
  const result = await run(Array.from({ length: 201 }, () => ({ geom, conflicto: 0 })));
  assert.equal(result.data.disponible, false);
  assert.equal(result.data.zonas.length, 200);
});
test('invalid input does not query database', async () => {
  const result = await run([], { geom: null });
  assert.equal(result.statusCode, 400);
  assert.equal(result.queried, false);
});
