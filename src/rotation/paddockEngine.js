'use strict';

const HORIZON = 7;
const {evaluatePriority, MODEL} = require('./fuzzyPriority');
const VERSION = 'rotacion_por_potrero_v3';
const round = value => Math.round(value * 100) / 100;

// Inputs and decisions are aggregates per paddock, never animal identities.
function recommend(input) {
  const paddocks = input.map(p => {
    const enabled = p.enabled !== false;
    const issues = [...(p.issues || [])];
    if ((enabled && (![p.stock, p.growth].every(Number.isFinite) || p.growth < 0)) || !Number.isFinite(p.demand) || p.demand < 0 ||
        !Number.isInteger(p.animals) || p.animals < 0 || (p.animals > 0 && p.demand <= 0)) {
      issues.push('Faltan estimaciones válidas de pasto o consumo.');
    }
    const valid = (p.included || !enabled) && !issues.length;
    // A negative ledger is an accumulated deficit, not negative physical biomass.
    const capacity = !enabled ? 0 : valid ? Math.max(0, p.stock) / HORIZON + p.growth : null;
    const excess = valid ? Math.max(0, p.demand - capacity) : null;
    const average = valid && p.animals ? p.demand / p.animals : null;
    const remove = !enabled ? p.animals : average ? Math.min(p.animals, Math.ceil(Math.max(0, excess - 1e-9) / average)) : 0;
    const priority = enabled && valid && remove > 0 ? evaluatePriority({...p, issues}) : null;
    return {...p, enabled, issues: [...new Set(issues)], capacity, average, remove, priority,
      excess: excess == null ? null : round(excess),
      pressure: valid && capacity > 0 ? round(100 * p.demand / capacity) : null,
      status: !enabled ? 'FUERA_USO' : !p.included ? 'EXCLUIDO' : !valid ? 'SIN_DATOS' : remove ? 'EXCESO' : capacity > p.demand + 1e-9 ? 'DISPONIBLE' : 'EQUILIBRADO',
      projectedAnimals: p.animals, projectedDemand: p.demand, outgoing: 0, incoming: 0};
  });
  const destinations = paddocks.filter(p => p.status === 'DISPONIBLE');
  const sources = paddocks.filter(p => p.status === 'EXCESO' || (!p.enabled && p.animals > 0)).sort((a,b) =>
    Number(a.enabled) - Number(b.enabled) || (b.priority?.score ?? 0) - (a.priority?.score ?? 0) ||
    (b.pressure ?? Infinity) - (a.pressure ?? Infinity) || b.remove - a.remove || a.id - b.id);
  const recommendations = [];
  for (const source of sources) {
    const allocations = new Map();
    let remaining = source.remove;
    // Water-fill available daily budgets. Batch each step up to the next load level.
    while (remaining > 0 && source.average > 0) {
      const options = destinations.filter(p => p.capacity - p.projectedDemand + 1e-9 >= source.average)
        .sort((a,b) => (a.projectedDemand + source.average) / a.capacity -
          (b.projectedDemand + source.average) / b.capacity || a.id - b.id);
      if (!options.length) break;
      const dest = options[0], next = options[1];
      const room = Math.floor((dest.capacity - dest.projectedDemand + 1e-9) / source.average);
      const untilNext = next ? Math.max(1, Math.ceil(((next.projectedDemand + source.average) / next.capacity * dest.capacity - dest.projectedDemand) / source.average - 1e-9)) : room;
      const quantity = Math.min(remaining, room, untilNext);
      dest.projectedDemand += quantity * source.average;
      dest.projectedAnimals += quantity;
      dest.incoming += quantity;
      source.projectedDemand -= quantity * source.average;
      source.projectedAnimals -= quantity;
      source.outgoing += quantity;
      allocations.set(dest.id, (allocations.get(dest.id) || 0) + quantity);
      remaining -= quantity;
    }
    recommendations.push({origin:source.id, name:source.name, remove:source.remove, reason:source.enabled?'EXCESO':'FUERA_USO', needsDemand:!source.average,
      allocated:source.outgoing, unallocated:remaining, excess:source.excess, priority:source.priority,
      excessPercent:source.capacity > 0 ? round(100 * (source.demand - source.capacity) / source.capacity) : null,
      destinations:[...allocations].map(([id, quantity]) => ({id, name:paddocks.find(p=>p.id===id).name, quantity}))});
  }
  for (const p of paddocks) {
    p.projectedDemand = Number.isFinite(p.projectedDemand) ? round(p.projectedDemand) : null;
    p.projectedBalance = p.capacity == null || !p.enabled ? null : round(Math.max(0,p.stock) + HORIZON * (p.growth - p.projectedDemand));
    p.projectedPressure = p.capacity > 0 ? round(100 * p.projectedDemand / p.capacity) : null;
    p.remainingExcess = p.capacity == null ? null : round(Math.max(0,p.projectedDemand-p.capacity));
  }
  return {version:VERSION, priorityModel:MODEL, horizon:HORIZON, paddocks, recommendations,
    partial:paddocks.some(p=>(p.included&&p.status==='SIN_DATOS')||(!p.enabled&&p.animals>0&&!p.average)),
    totals:{excessPaddocks:sources.filter(p=>p.enabled).length, closedPaddocks:sources.filter(p=>!p.enabled).length, toMove:sources.reduce((s,p)=>s+p.remove,0),
      allocated:sources.reduce((s,p)=>s+p.outgoing,0), pending:sources.reduce((s,p)=>s+p.remove-p.outgoing,0)}};
}

module.exports = { recommend, HORIZON, VERSION };
