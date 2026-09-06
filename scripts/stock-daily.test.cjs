const {test}=require('node:test');
const assert=require('node:assert/strict');
const {calculateDaily,consumptionForDay}=require('../src/services/stockDaily.service');
const estimates=[{id_estimacion:1,fecha_calculo:'2026-09-01T00:00:00Z',cantidad_animales:2,kg_materia_seca_dia:20}];
test('entrada y salida a mitad del día, sin duplicar asignación',()=>{
 const a={id_ganado:1,fecha_desde:'2026-09-02T15:00:00Z',fecha_hasta:'2026-09-03T15:00:00Z'};
 assert.equal(consumptionForDay('2026-09-01',[a],estimates).kg_ms,0);
 assert.equal(consumptionForDay('2026-09-02',[a,a],estimates).kg_ms,5);
 assert.equal(consumptionForDay('2026-09-03',[a],estimates).kg_ms,5);
 assert.equal(consumptionForDay('2026-09-04',[a],estimates).kg_ms,0);
});
test('DMI previo inexistente se identifica como aproximación',()=>{
 const a={id_ganado:1,fecha_desde:'2026-08-01',fecha_hasta:null};
 assert.equal(consumptionForDay('2026-08-10',[a],estimates).dmi_retroproyectado,true);
});
function model(fecha,days=5){
 const end=Date.parse(fecha+'T12:00:00Z');
 const refs=Array.from({length:days},(_,i)=>({fecha:new Date(end-(days-i-1)*86400000).toISOString().slice(0,10),referencia_min:8,referencia_central:10,referencia_max:12}));
 return {potrero:{superficie_ha:10,fecha_inicio:refs[0].fecha,fecha_objetivo:fecha},
 crecimiento:{porcentaje_utilizable_aplicado:50},coherencia:{estado:'REVISAR'},
 dmp:{periodos:[{fecha_fin:fecha,factor_dmp_aplicado:1,referencias_diarias:refs}]},referencias_regionales:[]};
}
test('potrero nuevo sin ganado ni DMI calcula la ventana inicial con consumo cero', async () => {
 let calls = 0;
 const result = await calculateDaily({
  potrero: {nombre:'Nuevo',geom:{type:'Polygon'}}, fecha:'2026-09-05',
  assignments:[], estimates:[], predict:async input => {
   calls++;
   assert.equal(input.dias_actualizacion, undefined);
   assert.equal(input.consumo_diario_total_kg_ms, 0);
   return model(input.fecha,38);
  },
 });
 assert.equal(calls,1);
 assert.equal(result.potrero.dias_calculo,38);
 assert.equal(result.consumo.acumulado_kg_ms_ha,0);
 assert.equal(result.stock_final_utilizable.valor_kg_ms_ha.central,190);
 assert.equal(result.crecimiento.crecimiento_utilizable_promedio_kg_ms_ha_dia.central,5);
});
test('saldo reutilizado, refresco cinco días y sin duplicar días',async()=>{
 let calls=0;
 const predict=async p=>{calls++;return model(p.fecha,p.dias_actualizacion??5)};
 const base={potrero:{nombre:'test',geom:{type:'Polygon'}},assignments:[],estimates,predict};
 const a=await calculateDaily({...base,fecha:'2026-09-05'});
 assert.equal(a.stock_final_utilizable.valor_kg_ms_ha.central,25);
 const b=await calculateDaily({...base,fecha:'2026-09-06',previous:{detalle_json:a}});
 assert.equal(calls,1);assert.equal(b.stock_final_utilizable.valor_kg_ms_ha.central,30);
 const repeat=await calculateDaily({...base,fecha:'2026-09-06',previous:{detalle_json:b}});
 assert.equal(repeat.seguimiento_diario.dias.length,6);
 assert.equal(repeat.stock_final_utilizable.valor_kg_ms_ha.central,30);
 const c=await calculateDaily({...base,fecha:'2026-09-10',previous:{detalle_json:repeat}});
 assert.equal(calls,2);assert.equal(c.seguimiento_diario.dias.length,10);
 assert.equal(c.seguimiento_diario.dias.some(d=>d.provisional),false);
 assert.equal(c.stock_final_utilizable.valor_kg_ms_ha.central,50);
});
