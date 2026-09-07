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
const STOCK_TIMEOUT_MS = Number(process.env.MODEL_API_STOCK_JOB_TIMEOUT_MS) || 3600000;

class ModeloPredictivoError extends Error {
  constructor(message, { cause, status, detail } = {}) {
    super(message);
    this.name = 'ModeloPredictivoError';
    if (cause) this.cause = cause;
    this.status = status;
    this.detail = detail;
  }
}

async function postJson(path, body, timeoutMs = TIMEOUT_MS) {
  if (!BASE_URL) {
    throw new ModeloPredictivoError('MODEL_API_BASE_URL no está configurada.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new ModeloPredictivoError(
        `El modelo predictivo respondió ${response.status} en ${path}.${text ? ` ${text}` : ''}`,
        { status: response.status, detail: text }
      );
    }
    try { return JSON.parse(text); }
    catch (cause) { throw new ModeloPredictivoError(`El modelo devolvió JSON inválido en ${path}.`, { cause }); }
  } catch (error) {
    if (error instanceof ModeloPredictivoError) throw error;
    throw new ModeloPredictivoError(`No se pudo completar la respuesta del modelo predictivo (${path}).`, { cause: error });
  } finally {
    clearTimeout(timeout);
  }
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

async function predictStock({ nombre_potrero, fecha, consumo_diario_total_kg_ms, geojson, dias_actualizacion }) {
  if (!BASE_URL) throw new ModeloPredictivoError('MODEL_API_BASE_URL no está configurada.');
  let response;
  try {
  response = await require('./stockHttp').postStockJson(`${BASE_URL}/predict/stock`, {
    nombre_potrero,
    fecha,
    consumo_diario_total_kg_ms,
    consumo_fuente: 'ultima_estimacion_dmi_persistida',
    geojson,
    ...(dias_actualizacion == null ? {} : { dias_actualizacion }),
  }, STOCK_TIMEOUT_MS);
  } catch (cause) {
    const code = cause.code || 'ERROR_CONEXION';
    const message = code === 'STOCK_TIMEOUT'
      ? `El cálculo de Stock superó el tiempo de espera de ${Math.round(STOCK_TIMEOUT_MS / 60000)} minutos.`
      : `Se interrumpió la conexión con Flask al calcular Stock (${code}). Verificá que Flask siga ejecutándose.`;
    throw new ModeloPredictivoError(message, {cause});
  }
  if (response.status < 200 || response.status >= 300) {
    throw new ModeloPredictivoError(`El modelo predictivo respondió ${response.status} en /predict/stock. ${response.text}`, {status:response.status,detail:response.text});
  }
  try { return JSON.parse(response.text); }
  catch (cause) { throw new ModeloPredictivoError('Flask devolvió una respuesta de Stock que no es JSON válido.', {cause}); }
}

module.exports = { predictDmp, predictDmi, predictStock, ModeloPredictivoError };
