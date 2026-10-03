const test = require('node:test');
const assert = require('node:assert/strict');
const { aggregate } = require('../src/rotation/paddockService');
const { recommend } = require('./reference-rotation/paddockEngine.cjs');

test('closed origin can evacuate with valid DMI while its stock job is running', () => {
  const p = { id: 1, name: 'Cerrado', habilitado_ganado: 0, animals: 6, area: 10 };
  const dmi = { cantidad_animales: 6, fecha_calculo: new Date(), kg_materia_seca_dia: 24 };
  const origin = aggregate(p, null, dmi, null, true, { estado: 'EJECUTANDO' });
  const destination = { id: 2, name: 'Disponible', animals: 0, stock: 168, growth: 0, demand: 0, included: true, issues: [] };
  const result = recommend([origin, destination]);
  assert.deepEqual(origin.issues, []);
  assert.equal(result.totals.allocated, 6);
  assert.equal(result.recommendations[0].needsDemand, false);
});

test('closed origin still requires recalculation when animal changes invalidate DMI', () => {
  const p = { id: 1, name: 'Cerrado', habilitado_ganado: 0, animals: 6, area: 10, cattle_changed: new Date() };
  const dmi = { cantidad_animales: 6, fecha_calculo: new Date(Date.now() - 60000), kg_materia_seca_dia: 24 };
  const origin = aggregate(p, null, dmi, null, true, { estado: 'EJECUTANDO' });
  assert.equal(origin.demand, null);
  assert.equal(recommend([origin]).recommendations[0].needsDemand, true);
});
