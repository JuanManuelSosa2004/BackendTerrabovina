'use strict';

/**
 * Cliente del módulo "Modelos Predictivos" (servicio Flask externo, fuera
 * de este backend Node). Reemplaza a fuentesExternas.placeholder.js y a la
 * mitad de estimaciones.placeholder.js: ya no fabricamos NDVI/clima ni
 * demanda nutricional, se los pedimos al modelo real.
 *
 * Dos endpoints:
 *  - POST /predict/dmp: recibe el potrero (nombre + geometría) y devuelve
 *    en una sola respuesta la imagen satelital, el vector climático y la
 *    predicción de disponibilidad forrajera (kg materia seca/ha).
 *  - POST /predict/dmi: recibe un lote de animales y devuelve, por
 *    animal, el consumo de materia seca estimado (demanda nutricional).
 *
 * Sin autenticación por ahora (confirmado con el equipo). Si en algún
 * momento la API pide un header/API key, es el único lugar que hay que
 * tocar.
 */

const BASE_URL = (process.env.MODEL_API_BASE_URL || '').replace(/\/$/, '');
const TIMEOUT_MS = Number(process.env.MODEL_API_TIMEOUT_MS) || 15000;

class ModeloPredictivoError extends Error {
  constructor(message, { cause } = {}) {
    super(message);
    this.name = 'ModeloPredictivoError';
    if (cause) this.cause = cause;
  }
}

async function postJson(path, body) {
  if (!BASE_URL) {
    throw new ModeloPredictivoError('MODEL_API_BASE_URL no está configurada.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    throw new ModeloPredictivoError(`No se pudo contactar al modelo predictivo (${path}).`, { cause: error });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const detalle = await response.text().catch(() => '');
    throw new ModeloPredictivoError(
      `El modelo predictivo respondió ${response.status} en ${path}.${detalle ? ` ${detalle}` : ''}`
    );
  }

  return response.json();
}

/**
 * @param {{ nombre_potrero: string, geojson: object }} input
 * @returns {Promise<{
 *   datos_imagen_satelital: object,
 *   feature_vector_enviado_al_modelo: object,
 *   dmp_kg_ms_ha_dia: number,
 *   dmp_kg_ms_ha_periodo: number,
 * }>}
 */
function predictDmp({ nombre_potrero, geojson }) {
  return postJson('/predict/dmp', { nombre_potrero, geojson });
}

/**
 * @param {{ animales: Array<{ animal_id: string, peso_vivo_kg: number, categoria_terrabovina: string, condicion_corporal?: number, estado_fisiologico_norm?: string }> }} input
 * @returns {Promise<{
 *   advertencias: string[],
 *   predicciones: Array<{ animal_id: string, dmi_kg_dia: number, dmi_pct_peso_vivo: number }>,
 * }>}
 */
function predictDmi({ animales }) {
  return postJson('/predict/dmi', { animales });
}

module.exports = { predictDmp, predictDmi, ModeloPredictivoError };
