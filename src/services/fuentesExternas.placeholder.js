'use strict';

/**
 * No hay adaptador real a Sentinel-2 ni al SMN/ERA5-Land en este backend
 * (§3.3.1-3.3.2 del PFI los describe como servicios externos desacoplados,
 * pero la integración todavía no existe). Estas funciones generan una
 * lectura plausible para poder ejercitar el resto del pipeline
 * (NDVI -> disponibilidad forrajera -> demanda -> recomendación) de punta
 * a punta. Reemplazar por el adaptador real sin tocar los controllers que
 * las usan (docs/backend-gap-analysis.md §8).
 */

function random(min, max) {
  return min + Math.random() * (max - min);
}

function generarObservacionSatelitalPlaceholder(fecha) {
  return {
    fuente: 'SENTINEL2_PLACEHOLDER',
    fecha,
    ndvi: Number(random(0.3, 0.8).toFixed(4)),
    nubosidad: Number(random(0, 15).toFixed(2)),
  };
}

function generarDatoClimaticoPlaceholder(fecha) {
  return {
    fuente: 'SMN_PLACEHOLDER',
    fecha,
    temperatura: Number(random(8, 28).toFixed(2)),
    precipitacion: Number(random(0, 5).toFixed(2)),
    humedad: Number(random(40, 85).toFixed(2)),
  };
}

module.exports = { generarObservacionSatelitalPlaceholder, generarDatoClimaticoPlaceholder };
