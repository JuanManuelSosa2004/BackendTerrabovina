'use strict';

// Read-only explanation of the existing regional-reference × DMP calculation.
// Never apply this factor a second time to stock or accessible growth.
const number = value => value != null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
const close = (a,b) => a != null && b != null && Math.abs(a-b) <= 0.0011;

function growthTrace(period, reference) {
  return {
    fecha_referencia: reference.fecha,
    fecha_tasa: period.fecha_fin,
    referencia_kg_ms_ha_dia: number(reference.referencia_central),
    factor_aplicado: number(period.factor_dmp_aplicado),
    factor_original: number(period.factor_dmp_original),
    factor_limitado: Boolean(period.factor_limitado),
    fecha_imagen: period.dmp_actual?.scene_date ?? null,
    anios_historicos: period.dmp_historico?.cantidad_anios_validos ?? null,
  };
}

function recoverTrace(detail, row) {
  if (row.traza_crecimiento) return row.traza_crecimiento;
  // Recover the reference actually used, including a September rate projected
  // into October. Do not substitute today's monthly curve or a window average.
  const date = row.provisional ? row.fecha_tasa : row.fecha;
  const observations = detail.seguimiento_diario?.observaciones ?? [];
  for (const observation of [...observations].reverse()) {
    const period = observation.detalle_dmp?.periodos?.find(p => p.fecha_fin === row.fecha_tasa
      && p.referencias_diarias?.some(ref => ref.fecha === date));
    const reference = period?.referencias_diarias.find(ref => ref.fecha === date);
    if (reference) return growthTrace(period, reference);
  }
  return null;
}

function compareGrowth(stock, valid) {
  const current = valid ? number(stock?.crecimiento_bruto_kg_ms_ha_dia) : null;
  const result = {
    version: 'referencia_dmp_v1', estado: valid ? 'base_conservada' : 'pendiente_actualizar',
    crecimiento_kg_ms_ha_dia: current, referencia_kg_ms_ha_dia: null,
    diferencia_porcentual: null, metodo: 'referencia_regional_por_anomalia_dmp',
    ajuste_adicional: false, validacion_local: false,
    mensaje: valid ? 'Se conserva el crecimiento vigente; falta una referencia trazable para compararlo.'
      : 'Actualizá el balance para consultar el crecimiento vigente.',
  };
  const detail = stock?.detalle_json;
  const row = detail?.seguimiento_diario?.dias?.at(-1);
  if (!valid || current == null || !row || row.fecha !== stock.fecha_objetivo) return result;
  const trace = recoverTrace(detail,row);
  if (!trace || trace.fecha_tasa !== row.fecha_tasa) return result;
  const reference = number(trace.referencia_kg_ms_ha_dia), factor = number(trace.factor_aplicado);
  if (reference == null || reference < 0 || factor == null || factor < 0
      || !close(current, number(row.bruto?.central))
      || !close(current, reference*factor)
      || (row.intrapotrero?.factor != null && row.intrapotrero.factor !== 1)) return result;
  return {...result, ...trace, estado:'comparacion_disponible',
    diferencia_porcentual: reference > 0 ? (factor-1)*100 : null,
    provisional: Boolean(row.provisional), fecha:row.fecha,
    mensaje:'La estimación vigente ya combina la referencia regional con clima y vegetación. No se aplica otro ajuste.',
  };
}

module.exports = {growthTrace, compareGrowth};
