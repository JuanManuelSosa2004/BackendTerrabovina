'use strict';

// Zero-order Sugeno inference: product AND and weighted singleton average.
// These are explicit operational heuristics, not fitted agronomic thresholds.
const MODEL = 'prioridad_sugeno_v1';
const clamp = x => Math.max(0, Math.min(1, x));
function partition(x, a, b, c) {
  const low = clamp((b - x) / (b - a));
  const high = clamp((x - b) / (c - b));
  return [low, Math.max(0, 1 - low - high), high];
}
const OUTPUTS = [[55, 20, 20], [90, 55, 20], [90, 90, 55]];
const pressureNames = ['BAJA', 'MEDIA', 'ALTA'];
const reserveNames = ['CORTA', 'MEDIA', 'LARGA'];
const round = x => Math.round(x * 100) / 100;

function evaluatePriority({stock, growth, demand, animals, issues = []}) {
  if (issues.length || ![stock, growth, demand, animals].every(Number.isFinite) ||
      growth < 0 || demand <= 0 || !Number.isInteger(animals) || animals <= 0) return null;
  // A zero growth rate saturates pressure at high, without serializing Infinity.
  const pressureRatio = growth === 0 ? null : demand / growth;
  const reserveDays = Math.max(0, stock) / demand;
  const pressure = partition(pressureRatio ?? 2, 0.8, 1.2, 2);
  // Reserve is stock/current demand, WITHOUT assuming future growth.
  const reserve = partition(reserveDays, 3, 7, 14);
  const rules = [];
  let sum = 0, weight = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const activation = pressure[i] * reserve[j];
    if (!activation) continue;
    sum += activation * OUTPUTS[i][j]; weight += activation;
    rules.push({pressure:pressureNames[i], reserve:reserveNames[j], activation:round(activation), output:OUTPUTS[i][j]});
  }
  const score = round(sum / weight);
  const level = score >= 70 ? 'ALTA' : score >= 40 ? 'MEDIA' : 'BAJA';
  const explanation = reserveDays <= 3
    ? 'La reserva estimada cubre hasta 3 días de consumo sin contar crecimiento.'
    : growth === 0 ? 'Hay consumo y no hay crecimiento utilizable estimado.'
    : pressureRatio >= 2 ? 'El consumo duplica o supera el crecimiento utilizable estimado.'
    : 'Prioridad según la presión de pastoreo y la reserva estimada.';
  return {model:MODEL, score, level, explanation,
    inputs:{pressureRatio:pressureRatio == null ? null : round(pressureRatio), zeroGrowth:growth === 0, reserveDays:round(reserveDays)}, rules};
}

module.exports = {evaluatePriority, MODEL};
