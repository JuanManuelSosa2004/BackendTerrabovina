'use strict';
const DAY = 86400000;
const KEYS = ['min', 'central', 'max'];
const VERSION = 'balance_diario_asignaciones_v3';
const dayMs = d => Date.parse(String(d).slice(0, 10) + 'T00:00:00-03:00');
const dateOf = ms => new Date(ms - 3 * 3600000).toISOString().slice(0, 10);
const nextDay = (d, n = 1) => dateOf(dayMs(d) + n * DAY);
function instant(v) {
  if (v instanceof Date) return v.getTime();
  const s = String(v);
  return Date.parse(s.length === 10 ? s + 'T00:00:00-03:00' : /Z$|[+-]\d\d:\d\d$/.test(s) ? s : s.replace(' ', 'T') + 'Z');
}

// Intervalos [entrada, salida): un traslado no descuenta dos veces al animal.
function consumptionForDay(day, assignments, estimates) {
  const start = dayMs(day), end = start + DAY;
  const byAnimal = new Map();
  for (const a of assignments) {
    const lo = Math.max(start, instant(a.fecha_desde));
    const hi = Math.min(end, a.fecha_hasta ? instant(a.fecha_hasta) : end);
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) throw Error('Fecha de asignación inválida.');
    if (hi <= lo) continue;
    if (!byAnimal.has(a.id_ganado)) byAnimal.set(a.id_ganado, []);
    byAnimal.get(a.id_ganado).push([lo, hi]);
  }
  const ds = estimates.filter(d => Number(d.cantidad_animales) > 0 && Number.isFinite(Number(d.kg_materia_seca_dia)))
    .sort((a,b) => instant(a.fecha_calculo)-instant(b.fecha_calculo));
  let kg = 0, animalDays = 0, inferred = false;
  const used = new Set();
  for (const [animalId, intervals] of byAnimal) {
    const retrospective = assignments.filter(a => a.id_ganado === animalId && a.dmi_ingreso_kg_dia != null
      && Number.isFinite(Number(a.dmi_ingreso_kg_dia)) && Number(a.dmi_ingreso_kg_dia) >= 0);
    intervals.sort((a,b) => a[0]-b[0]);
    const merged = [];
    for (const [lo, hi] of intervals) {
      const last = merged.at(-1);
      if (last && lo <= last[1]) last[1] = Math.max(hi,last[1]);
      else merged.push([lo,hi]);
    }
    for (const [lo,hi] of merged) {
      const points = [...new Set([lo,...ds.map(d=>instant(d.fecha_calculo)),
        ...retrospective.flatMap(a=>[instant(a.fecha_desde),instant(a.created_at), a.fecha_hasta ? instant(a.fecha_hasta) : hi]),hi]
        .filter(t=>t>=lo&&t<=hi))].sort((a,b)=>a-b);
      for (let i=0;i<points.length-1;i++) {
        const retro = retrospective.find(a => instant(a.fecha_desde) <= points[i] && points[i] < instant(a.created_at)
          && (!a.fecha_hasta || points[i] < instant(a.fecha_hasta)));
        if (retro) {
          const fraction = (points[i+1]-points[i])/DAY;
          animalDays += fraction;
          kg += fraction * Number(retro.dmi_ingreso_kg_dia);
          inferred = true;
          continue;
        }
        const available = ds.filter(d=>instant(d.fecha_calculo)<=points[i]);
        const d = available.at(-1) ?? ds[0];
        if (!d) throw Error('Falta DMI para estimar consumo de animales históricos.');
        inferred ||= !available.length;
        const fraction = (points[i+1]-points[i])/DAY;
        animalDays += fraction;
        kg += fraction * Number(d.kg_materia_seca_dia)/Number(d.cantidad_animales);
        used.add(d.id_estimacion);
      }
    }
  }
  return { kg_ms: kg, animales_dia: animalDays, ids_dmi: [...used], dmi_retroproyectado: inferred,
    metodo: 'fechas_asignacion_dmi_ingreso_retrospectivo_y_promedio_por_animal' };
}

function rowsFromCalculation(result) {
  const factor = result.crecimiento.porcentaje_utilizable_aplicado/100;
  return result.dmp.periodos.flatMap(p => p.referencias_diarias.map(ref => ({
    fecha: ref.fecha,
    bruto: Object.fromEntries(KEYS.map(k => [k,ref['referencia_'+k]*p.factor_dmp_aplicado])),
    utilizable: Object.fromEntries(KEYS.map(k => [k,ref['referencia_'+k]*p.factor_dmp_aplicado*factor])),
    provisional: false,
    fecha_tasa: p.fecha_fin,
  })));
}

async function calculateDaily({ potrero, fecha, previous, assignments, estimates, predict }) {
  const old = previous?.detalle_json;
  const geom = JSON.stringify(potrero.geom);
  let result, ledger, observations, refreshed;
  const valid = old?.metodologia === VERSION && old.seguimiento_diario?.geometria === geom;
  if (!valid) {
    result = await predict({ nombre_potrero:potrero.nombre, geojson:potrero.geom, fecha, consumo_diario_total_kg_ms:0 });
    ledger = rowsFromCalculation(result);
    observations = [{ fecha, detalle_dmp:result.dmp, referencias:result.referencias_regionales }];
    refreshed = fecha;
  } else {
    result = structuredClone(old);
    ledger = result.seguimiento_diario.dias;
    observations = result.seguimiento_diario.observaciones;
    refreshed = result.seguimiento_diario.crecimiento_actualizado_hasta;
    if (fecha < old.potrero.fecha_objetivo) throw Error('El balance diario no admite retroceder la fecha.');
    // Reemplaza únicamente proyecciones de bloques completos nuevos, sin duplicarlas.
    while (dayMs(fecha)-dayMs(refreshed) >= 5*DAY) {
      const end = nextDay(refreshed,5);
      const growth = await predict({ nombre_potrero:potrero.nombre, geojson:potrero.geom, fecha:end,
        consumo_diario_total_kg_ms:0, dias_actualizacion:5 });
      ledger = ledger.filter(d=>d.fecha<=refreshed).concat(rowsFromCalculation(growth));
      observations.push({fecha:end,detalle_dmp:growth.dmp,referencias:growth.referencias_regionales});
      refreshed = end;
      result.dmp = growth.dmp;
      result.coherencia = growth.coherencia;
    }
    for (let day = nextDay(ledger.at(-1).fecha); day <= fecha; day = nextDay(day)) {
      const last = ledger.at(-1);
      ledger.push({fecha:day,bruto:{...last.bruto},utilizable:{...last.utilizable},provisional:true,fecha_tasa:last.fecha_tasa});
    }
  }
  const area = Number(result.potrero.superficie_ha);
  const production = Object.fromEntries(KEYS.map(k=>[k,0]));
  let consumption = 0;
  for (const row of ledger) {
    row.consumo = consumptionForDay(row.fecha,assignments,estimates);
    consumption += row.consumo.kg_ms/area;
    for (const k of KEYS) production[k] += row.utilizable[k];
    row.stock_kg_ms_ha = Object.fromEntries(KEYS.map(k=>[k,Math.max(0,production[k]-consumption)]));
  }
  const round = v => Math.round(v*1000)/1000;
  const final = ledger.at(-1);
  const lastConsumption = final.consumo.kg_ms;
  result.metodologia = VERSION;
  result.potrero.fecha_objetivo = fecha;
  result.potrero.dias_calculo = ledger.length;
  result.generado_en = new Date().toISOString();
  result.seguimiento_diario = {geometria:geom,dias:ledger,observaciones:observations,
    crecimiento_actualizado_hasta:refreshed,proxima_actualizacion:nextDay(refreshed,5),
    advertencia:'Consumo estimado por promedio DMI y fechas de asignación. Sin registros se asume ausencia de ganado. Hoy incluye el día completo y es provisional; las tasas se proyectan hasta la próxima actualización.'};
  result.consumo = {fuente:'historial_asignaciones_dmi_promedio',diario_total_potrero_kg_ms:round(lastConsumption),
    diario_kg_ms_ha:round(lastConsumption/area),acumulado_kg_ms_ha:round(consumption),acumulado_total_potrero_kg_ms:round(consumption*area)};
  result.stock_inicial_estimado = {estado:'PRODUCCION_ACUMULADA_ESTIMADA',metodo:'suma_produccion_utilizable_bloques_5_dias',
    confianza:'BAJA',medicion_real:false,valor_kg_ms_ha:Object.fromEntries(KEYS.map(k=>[k,round(production[k])]))};
  result.crecimiento.crecimiento_bruto_promedio_kg_ms_ha_dia = final.bruto;
  result.crecimiento.crecimiento_utilizable_promedio_kg_ms_ha_dia = final.utilizable;
  result.crecimiento.descripcion = 'Tasa del último día estimado; producción acumulada desde la inicialización.';
  result.crecimiento.produccion_utilizable_acumulada_kg_ms_ha = result.stock_inicial_estimado.valor_kg_ms_ha;
  result.stock_final_utilizable = {unidad:'kg MS/ha',valor_kg_ms_ha:Object.fromEntries(KEYS.map(k=>[k,round(final.stock_kg_ms_ha[k])])),
    total_potrero_kg_ms:Object.fromEntries(KEYS.map(k=>[k,round(final.stock_kg_ms_ha[k]*area)])),formula:'max(0, produccion_desde_inicio - consumo_segun_asignaciones)'};
  result.balance_stock = {formula:result.stock_final_utilizable.formula,consumo:result.consumo,
    stock_inicial_estimado:result.stock_inicial_estimado,stock_inicial_fuente:result.stock_inicial_estimado.metodo,
    stock_inicial_kg_ms_ha:result.stock_inicial_estimado.valor_kg_ms_ha,
    stock_final_utilizable_kg_ms_ha:result.stock_final_utilizable.valor_kg_ms_ha,
    stock_final_utilizable_total_potrero_kg_ms:result.stock_final_utilizable.total_potrero_kg_ms,
    demanda_no_cubierta_kg_ms_ha:Object.fromEntries(KEYS.map(k=>[k,round(Math.max(0,consumption-production[k]))]))};
  return result;
}
module.exports = {calculateDaily,consumptionForDay,rowsFromCalculation,VERSION};
