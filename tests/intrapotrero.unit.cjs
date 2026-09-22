const { test } = require('node:test');
const assert = require('node:assert/strict');
const { geometryHash, validateAnalysis } = require('../src/services/intrapotrero');

function analysis() {
  return { illustrative: false, version: 'sentinel2-intrapotrero-v1', dates: ['2026-09-20'],
    scenes: { '2026-09-20': { cells: { features: [] } } },
    sectors: [{ areaHa: 10, geometry: { type: 'Polygon' }, observations: { '2026-09-20': 0.5 }, validAreaHa: { '2026-09-20': 5 } }] };
}

test('geometry fingerprint changes when the paddock boundary changes', () => {
  const original = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };
  assert.equal(geometryHash(original), geometryHash(JSON.parse(JSON.stringify(original))));
  assert.notEqual(geometryHash(original), geometryHash({ ...original, coordinates: [[[0, 0], [2, 0], [1, 1], [0, 0]]] }));
});

test('accepts observed partial coverage and rejects fabricated or impossible data', () => {
  assert.equal(validateAnalysis(analysis()).sectors[0].validAreaHa['2026-09-20'], 5);
  for (const mutate of [a => { a.illustrative = true; }, a => { a.sectors[0].validAreaHa['2026-09-20'] = 11; },
    a => { a.sectors[0].observations['2026-09-20'] = NaN; }, a => { a.sectors[0].observations['2026-09-20'] = null; }]) {
    const data = analysis(); mutate(data);
    assert.throws(() => validateAnalysis(data));
  }
});
