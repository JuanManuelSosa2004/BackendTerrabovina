const {test}=require('node:test');
const assert=require('node:assert/strict');
const {calculateDaily}=require('../src/services/stockDaily.service');
const {revisionForDay,summarize}=require('../src/services/intrapotrero.service');
const geom={type:'Polygon',coordinates:[]};
const revision=(id,day,factor)=>({id,vigente_desde:day,geometria_potrero:geom,analisis:{factor_mensual:Array(12).fill(factor),matriz_version:'1.1.0'}});
const model=fecha=>({potrero:{superficie_ha:10,fecha_inicio:'2026-09-25',fecha_objetivo:fecha},crecimiento:{porcentaje_utilizable_aplicado:50},
 dmp:{periodos:[{fecha_fin:fecha,factor_dmp_aplicado:1,referencias_diarias:['2026-09-25','2026-09-26','2026-09-27'].map(fecha=>({fecha,referencia_min:8,referencia_central:10,referencia_max:12}))}]},referencias_regionales:[]});

test('retired curves preserve earlier days, stop at release date and remain idempotent',async()=>{
 const base={potrero:{nombre:'test',geom},fecha:'2026-09-27',predict:async p=>model(p.fecha),
 assignments:[{id_ganado:1,fecha_desde:'2026-09-25'}],estimates:[{id_estimacion:1,fecha_calculo:'2026-09-25T00:00:00Z',cantidad_animales:1,kg_materia_seca_dia:10}]};
 const before=await calculateDaily(base);
 const revisions=[revision(1,'2026-09-26',2)];
 const adjusted=await calculateDaily({...base,revisions,previous:{detalle_json:before}});
 assert.equal(adjusted.stock_final_utilizable.valor_kg_ms_ha.central,17);
 assert.deepEqual(adjusted.consumo,before.consumo);
 assert.deepEqual(adjusted.seguimiento_diario.dias.map(d=>d.utilizable.central),[5,10,5]);
 const repeated=await calculateDaily({...base,revisions,previous:{detalle_json:adjusted}});
 assert.deepEqual(repeated.stock_final_utilizable,adjusted.stock_final_utilizable);
 const restored=await calculateDaily({...base,revisions:[...revisions,revision(2,'2026-09-27',1)],previous:{detalle_json:repeated}});
 assert.deepEqual(restored.stock_final_utilizable,adjusted.stock_final_utilizable);
 const next=await calculateDaily({...base,fecha:'2026-09-28',revisions,previous:{detalle_json:adjusted}});
 assert.equal(next.seguimiento_diario.dias.at(-1).utilizable.central,5);
});
test('boundary change suspends latest version rather than reviving an older one',()=>{
 const old=revision(1,'2026-09-25',2),recent={...revision(2,'2026-09-26',3),geometria_potrero:{different:true}};
 assert.equal(revisionForDay([old,recent],'2026-09-27',geom),null);
 assert.equal(revisionForDay([old,recent],'2026-09-25',geom).id,1);
});
test('no accessible area is not an infinite density; stale balance does not appear current',()=>{
 const a={fecha:'2026-09-27',superficie_total_ha:10,superficie_pastoreable_ha:0,referencia_ponderada_mensual:Array(12).fill(10),referencia_accesible_mensual:Array(12).fill(0)};
 const s={fecha_objetivo:a.fecha,crecimiento_bruto_kg_ms_ha_dia:10,crecimiento_utilizable_kg_ms_ha_dia:5,stock_final_total_kg_ms:100,detalle_json:{seguimiento_diario:{dias:[{intrapotrero:{version:1}}]}}};
 const current=summarize(a,s,20,1);
 assert.equal(current.carga_cabezas_ha_pastoreable,null);
 assert.equal(current.stock_accesible_proxy_kg_ms,0);
 assert.equal(current.crecimiento_accesible_total_kg_ms_dia,0);
 assert.equal(summarize(a,s,20,2).crecimiento_bruto_kg_ms_ha_dia,null);
 assert.equal(summarize(a,s,20,2).pendiente_actualizar,true);
});

test('a cached balance with a retired coefficient requires recalculation',()=>{
 const a={version:'relieve_sin_curvas_v2',fecha:'2026-09-27',superficie_total_ha:10,superficie_pastoreable_ha:5,referencia_ponderada_mensual:Array(12).fill(10),referencia_accesible_mensual:Array(12).fill(5)};
 const s={fecha_objetivo:a.fecha,crecimiento_bruto_kg_ms_ha_dia:20,crecimiento_utilizable_kg_ms_ha_dia:10,stock_final_total_kg_ms:100,detalle_json:{seguimiento_diario:{dias:[{intrapotrero:{version:1,factor:2}}]}}};
 assert.equal(summarize(a,s,20,1).pendiente_actualizar,true);
 assert.equal(summarize(a,s,20,1).crecimiento_bruto_kg_ms_ha_dia,null);
 s.detalle_json.seguimiento_diario.dias[0].intrapotrero.factor=1;
 assert.equal(summarize(a,s,20,1).pendiente_actualizar,false);
});
