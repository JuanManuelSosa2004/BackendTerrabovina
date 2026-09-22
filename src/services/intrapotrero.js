'use strict';
const { createHash } = require('node:crypto');

function geometryHash(geometry) {
  return createHash('sha256').update(JSON.stringify(geometry)).digest('hex');
}

function validateAnalysis(data) {
  if (!data || data.illustrative !== false || data.version !== 'sentinel2-intrapotrero-v1' ||
      !Array.isArray(data.dates) || data.dates.length < 1 || data.dates.length > 4 ||
      !Array.isArray(data.sectors) || data.sectors.length < 1 || data.sectors.length > 4) {
    throw new Error('El servicio satelital devolvió un análisis inválido.');
  }
  for (const date of data.dates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !data.scenes?.[date]?.cells?.features ||
        data.scenes[date].cells.features.length > 3000) throw new Error('Observación espacial inválida.');
    for (const sector of data.sectors) {
      const value = sector.observations?.[date];
      const area = sector.validAreaHa?.[date];
      if (!(sector.areaHa > 0) || !Number.isFinite(sector.areaHa) ||
          !Number.isFinite(area) || area < 0 || area > sector.areaHa + 0.0001 ||
          (value !== null && (!Number.isFinite(value) || value < -1 || value > 1)) ||
          (value === null && area !== 0) || !sector.geometry) throw new Error('Datos del sector inválidos.');
    }
  }
  return data;
}

async function analyze(geometry) {
  const base = (process.env.MODEL_API_BASE_URL || '').replace(/\/$/, '');
  if (!base) throw new Error('El servicio satelital no está configurado.');
  const response = await require('./stockHttp').postStockJson(`${base}/analysis/intrapaddock`, { geojson: geometry }, 600000);
  let data;
  try { data = JSON.parse(response.text); }
  catch { throw new Error('El servicio satelital no devolvió una respuesta válida.'); }
  if (response.status < 200 || response.status >= 300) {
    throw new Error(data.error || 'No se pudo obtener el análisis satelital.');
  }
  return validateAnalysis(data);
}

module.exports = { analyze, geometryHash, validateAnalysis };
