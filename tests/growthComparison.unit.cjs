const {test}=require('node:test');
const assert=require('node:assert/strict');
const {compareGrowth}=require('../src/services/growthComparison.service');
const {growthTrace}=require('../src/services/growthComparison.service');
const {calculateDaily,rowsFromCalculation}=require('../src/services/stockDaily.service');
function fixture({factor=1.2,ref=10,day='2026-09-30',provisional=false}={}) {
 const period={fecha_fin:'2026-09-30',factor_dmp_aplicado:factor,factor_dmp_original:factor,
  dmp_actual:{scene_date:'2026-09-28'},dmp_historico:{cantidad_anios_validos:5},
  referencias_diarias:[{fecha:'2026-09-30',referencia_central:ref,referencia_min:ref,referencia_max:ref}]};
 const result={potrero:{superficie_ha:10,fecha_objetivo:'2026-09-30'},crecimiento:{porcentaje_utilizable_aplicado:50},dmp:{periodos:[period]},referencias_regionales:[]};
 const row={...rowsFromCalculation(result)[0],fecha:day,provisional,intrapotrero:{factor:1}};
 return {fecha_objetivo:day,crecimiento_bruto_kg_ms_ha_dia:String(ref*factor),detalle_json:{...result,seguimiento_diario:{dias:[row],observaciones:[{detalle_dmp:result.dmp}]}}};
}
test('regional fallback does not claim observed normal climate or a DMP comparison',()=>{
 const stock=fixture({factor:1});
 const row=stock.detalle_json.seguimiento_diario.dias[0];
 row.traza_crecimiento={...row.traza_crecimiento,metodo_crecimiento:'REFERENCIA_REGIONAL',factor_original:null,motivo_respaldo:'Sin imágenes',fecha_imagen:null};
 const c=compareGrowth(stock,true);
 assert.equal(c.estado,'base_conservada');
 assert.equal(c.diferencia_porcentual,null);
 assert.equal(c.crecimiento_kg_ms_ha_dia,10);
 assert.equal(c.metodo,'referencia_regional_estacional');
 assert.equal(c.fecha_imagen,null);
});
test('reads actual nested image date and supports absent DMP observations',()=>{
 assert.equal(growthTrace({dmp_actual:{escena:{fecha:'2026-09-20'}}},{}).fecha_imagen,'2026-09-20');
 assert.equal(growthTrace({dmp_actual:null},{}).fecha_imagen,null);
});
test('compares the existing estimate and reference without modifying the ledger',()=>{
 const stock=fixture(),before=JSON.stringify(stock),c=compareGrowth(stock,true);
 assert.equal(c.estado,'comparacion_disponible');
 assert.equal(c.referencia_kg_ms_ha_dia,10); assert.equal(c.crecimiento_kg_ms_ha_dia,12);
 assert.ok(Math.abs(c.diferencia_porcentual-20)<1e-8);
 assert.equal(c.fecha_imagen,'2026-09-28'); assert.equal(c.validacion_local,false);
 assert.equal(JSON.stringify(stock),before);
});
test('legacy provisional month crossing keeps the original reference, not the new month',()=>{
 const stock=fixture({day:'2026-10-02',provisional:true});
 delete stock.detalle_json.seguimiento_diario.dias[0].traza_crecimiento;
 stock.detalle_json.crecimiento.crecimiento_regional_normal_promedio_kg_ms_ha_dia={central:999};
 const c=compareGrowth(stock,true);
 assert.equal(c.referencia_kg_ms_ha_dia,10); assert.equal(c.fecha_referencia,'2026-09-30');
 assert.equal(c.provisional,true); assert.equal(c.fecha,'2026-10-02');
});
test('missing trace preserves growth without fabricating zero or an adjustment',()=>{
 const stock=fixture(); delete stock.detalle_json.seguimiento_diario.dias[0].traza_crecimiento;
 stock.detalle_json.seguimiento_diario.observaciones=[];
 const c=compareGrowth(stock,true);
 assert.equal(c.estado,'base_conservada'); assert.equal(c.crecimiento_kg_ms_ha_dia,12);
 assert.equal(c.diferencia_porcentual,null); assert.equal(c.referencia_kg_ms_ha_dia,null);
});
test('stale, inconsistent and historically adjusted records cannot masquerade as current comparisons',()=>{
 assert.equal(compareGrowth(fixture(),false).crecimiento_kg_ms_ha_dia,null);
 for(const mutate of [s=>s.crecimiento_bruto_kg_ms_ha_dia=null,s=>s.crecimiento_bruto_kg_ms_ha_dia=20,
 s=>s.detalle_json.seguimiento_diario.dias[0].intrapotrero.factor=2,
 s=>s.detalle_json.seguimiento_diario.dias[0].fecha='2026-09-29']) {
  const s=fixture();mutate(s);assert.notEqual(compareGrowth(s,true).estado,'comparacion_disponible');
 }
});
test('reports the capped factor and does not divide by a zero reference',()=>{
 const s=fixture({factor:1.5});const trace=s.detalle_json.seguimiento_diario.dias[0].traza_crecimiento;
 trace.factor_limitado=true;trace.factor_original=2.1;
 assert.equal(compareGrowth(s,true).diferencia_porcentual,50);
 assert.equal(compareGrowth(s,true).factor_limitado,true);
 assert.equal(compareGrowth(fixture({ref:0}),true).diferencia_porcentual,null);
});
test('adding trace metadata leaves production, consumption and stock unchanged across refresh/projection',async()=>{
 const stock=fixture();const result=stock.detalle_json;
 const input={potrero:{geom:{type:'Polygon',coordinates:[]},nombre:'test'},fecha:'2026-09-30',assignments:[],estimates:[],predict:async()=>structuredClone(result)};
 const first=await calculateDaily(input);
 const legacy=structuredClone(first);for(const row of legacy.seguimiento_diario.dias) delete row.traza_crecimiento;
 const withTrace=await calculateDaily({...input,fecha:'2026-10-02',previous:{detalle_json:first}});
 const withoutTrace=await calculateDaily({...input,fecha:'2026-10-02',previous:{detalle_json:legacy}});
 assert.deepEqual(withTrace.stock_final_utilizable,withoutTrace.stock_final_utilizable);
 assert.deepEqual(withTrace.consumo,withoutTrace.consumo);
 assert.deepEqual(withTrace.crecimiento,withoutTrace.crecimiento);
 assert.equal(withTrace.seguimiento_diario.dias.at(-1).traza_crecimiento.fecha_referencia,'2026-09-30');
});
