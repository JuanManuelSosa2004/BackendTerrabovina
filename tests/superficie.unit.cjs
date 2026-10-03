const test = require('node:test');
const assert = require('node:assert/strict');
const { validarSuperficie } = require('../src/utils/superficie');
const { aggregate } = require('../src/rotation/paddockService');
const { today } = require('../src/rotation/rules');

test('rejects invalid hectares before persistence', () => {
  for (const value of [-1, 0, 0.001, '', ' ', true, [], {}, 'abc', Infinity, 100000000]) {
    assert.ok(validarSuperficie(value, 'superficie_ha'), String(value));
  }
  for (const value of [undefined, null, 0.01, 0.8, '120.24', 99999999.99]) {
    assert.equal(validarSuperficie(value, 'superficie_ha'), null);
  }
});

test('rotation derives capacity from balance geometry area, not manual hectares', () => {
  const geometry={type:'Polygon',coordinates:[]};
  const p={id:1,name:'QA',animals:0,area:100000,geometry};
  const stock={superficie_ha:'2.000',fecha_objetivo:today(),fecha_calculo:new Date(),
    stock_final_total_kg_ms:'100',crecimiento_utilizable_kg_ms_ha_dia:'10',
    detalle_json:{seguimiento_diario:{geometria:geometry}}};
  const result=aggregate(p,stock,null,null,true,{});
  assert.equal(result.area,2);
  assert.equal(result.growth,20);
  assert.deepEqual(result.issues,[]);
});
