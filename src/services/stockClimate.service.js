'use strict';

const FIELDS = ['temperatura', 'precipitacion', 'humedad'];
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function number(value, min, max) {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? Math.round(parsed * 100) / 100 : null;
}

function latestClimate(result) {
  const blocks = [result?.dmp, ...(result?.seguimiento_diario?.observaciones ?? []).map(o => o.detalle_dmp)];
  const candidates = [];
  for (const block of blocks) {
    for (const period of block?.periodos ?? []) {
      // Historical comparison years must never become the paddock's current weather.
      const data = period.dmp_actual?.clima;
      if (!data || data.fuente !== 'OPEN_METEO_ARCHIVE' || !validDate(data.fecha)) continue;
      if (result?.potrero?.fecha_objetivo && data.fecha > result.potrero.fecha_objetivo) continue;
      const row = { fuente: data.fuente, fecha: data.fecha,
        temperatura: number(data.temperatura, -100, 100),
        precipitacion: number(data.precipitacion, 0, 9999.99),
        humedad: number(data.humedad, 0, 100) };
      if (FIELDS.some(key => row[key] !== null)) candidates.push(row);
    }
  }
  return candidates.sort((a, b) => b.fecha.localeCompare(a.fecha))[0] ?? null;
}

async function persistStockClimate(id_potrero, result, transaction, repository) {
  const data = latestClimate(result);
  if (!data) return null; // Regional fallback has no weather observation to insert.
  const previous = await repository.getUltimoByPotrero(id_potrero, transaction);
  if (previous) {
    const previousDate = previous.fecha instanceof Date ? previous.fecha.toISOString().slice(0, 10) : String(previous.fecha).slice(0, 10);
    if (previousDate > data.fecha) return previous;
    if (previousDate === data.fecha && previous.fuente === data.fuente && FIELDS.every(key =>
      previous[key] == null ? data[key] === null : data[key] !== null && Number(previous[key]) === data[key])) return previous;
  }
  return repository.crearDato({ id_potrero, ...data }, transaction);
}

module.exports = { latestClimate, persistStockClimate };
