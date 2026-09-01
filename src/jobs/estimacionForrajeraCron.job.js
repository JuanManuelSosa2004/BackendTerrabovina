'use strict';

/**
 * Ciclo automático de estimación forrajera (docs/estimacion-biomasa-parada.md
 * §7 "independencia del usuario"). Sin esto, disponibilidad_forrajera y
 * dato_climatico nunca forman una serie: nacen solo cuando alguien pide una
 * estimación manual (ver el comentario de
 * analiticasConsumo.repository.js#getAnaliticasConsumo sobre por qué no se
 * rellenan los días sin medición).
 *
 * Cadencia: Sentinel-2 revisita cada ~5 días. Pedirle al modelo una
 * estimación todos los días reintenta sobre la misma escena la mayoría de
 * las veces y gasta cómputo del modelo predictivo sin sumar ningún punto
 * nuevo a balanceForrajero.service.js#integrarTasa, que ya está diseñado
 * para integrar muestras irregulares.
 *
 * El tick corre una vez por día, pero la cadencia de 5 días se decide POR
 * POTRERO (necesitaEstimacion), no por la frecuencia del tick: cada potrero
 * se reestima solo si su última observación tiene CADENCIA_DIAS o más. Esto
 * se autocorrige si un ciclo falla (el potrero simplemente sigue "vencido"
 * hasta el próximo tick) y no requiere coordinar una fecha global entre
 * potreros creados en momentos distintos.
 *
 * LIMITACIÓN: asume una sola instancia del backend corriendo el scheduler
 * (por eso SCHEDULER_ENABLED en src/index.js/.env.example). necesitaEstimacion
 * lee antes de que generarEstimacionForrajera escriba, así que con más de
 * una instancia hay una ventana de carrera: dos procesos pueden leer "vencido"
 * antes de que cualquiera persista, y ambos le pegan al modelo. No corrompe
 * el cálculo — dos observaciones con la misma fecha aportan un trapecio de
 * ancho cero a integrarTasa — pero desperdicia cómputo del modelo y deja
 * filas de más. La resolución de fondo (fuera de este backend) es un
 * EventBridge Scheduler llamando a un endpoint interno en vez de un timer
 * en cada contenedor.
 */

const potreroRepository = require('../database/sql/potrero.repository');
const observacionSatelitalRepository = require('../database/sql/observacionSatelital.repository');
const { generarEstimacionForrajera } = require('../services/estimacionForrajera.service');
const { ModeloPredictivoError } = require('../services/modeloPredictivo.client');

const CADENCIA_DIAS = 5;
const MS_POR_DIA = 86400000;
// MS_POR_DIA ya es un día completo — el tick es diario, así que el
// intervalo es directamente MS_POR_DIA, sin multiplicar por 24 (eso daría
// 24 días, no 24 horas).
const INTERVALO_TICK_MS = MS_POR_DIA;

// setInterval/setTimeout de Node sólo aceptan un entero de 32 bits con
// signo como delay (2147483647 ms, ~24,8 días); por encima de eso Node
// clampea el delay a 1ms y el intervalo pasa a dispararse en bucle
// cerrado en vez de una vez por día — el bug real que tenía esta cuenta
// antes de corregirla (24 * MS_POR_DIA quedaba al 96,6% de ese límite).
// El valor actual está lejos del máximo, pero se afirma en tiempo de
// carga para que un cambio futuro que lo acerque falle acá y no en
// producción.
const SETINTERVAL_MAX_MS = 2147483647;
if (INTERVALO_TICK_MS > SETINTERVAL_MAX_MS) {
  throw new Error(
    `INTERVALO_TICK_MS (${INTERVALO_TICK_MS}) supera el máximo que admite setInterval ` +
      `(${SETINTERVAL_MAX_MS}); el tick dejaría de correr una vez por día.`
  );
}

function aFechaISO(valor) {
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  return String(valor).slice(0, 10);
}

// 'YYYY-MM-DD' se parsea como UTC medianoche (spec de Date, sin construir
// un Date local primero) — mismo criterio que
// balanceForrajero.service.js#estacionDe.
function diasDesde(fechaIso) {
  const t = new Date(fechaIso).getTime();
  if (Number.isNaN(t)) return Infinity;
  return (Date.now() - t) / MS_POR_DIA;
}

async function necesitaEstimacion(id_potrero) {
  const ultima = await observacionSatelitalRepository.getUltimaByPotrero(id_potrero);
  if (!ultima) return true;
  return diasDesde(aFechaISO(ultima.fecha)) >= CADENCIA_DIAS;
}

/**
 * Recorre los potreros activos y reestima los que tienen CADENCIA_DIAS o
 * más desde su última observación satelital. Un potrero que falla (modelo
 * caído, timeout) no aborta el ciclo: se registra el error y se sigue con
 * el resto; ese potrero vuelve a intentarse en el próximo tick.
 *
 * @returns {Promise<{ procesados: number, generados: number, omitidos: number, errores: number }>}
 */
async function ejecutarCicloEstimacionForrajera() {
  const potreros = await potreroRepository.getPotrerosActivos();
  const resultado = { procesados: 0, generados: 0, omitidos: 0, errores: 0 };

  for (const potrero of potreros) {
    let requiereEstimacion;
    try {
      requiereEstimacion = await necesitaEstimacion(potrero.id_potrero);
    } catch (error) {
      resultado.errores += 1;
      console.error(`[estimacionForrajeraCron] potrero ${potrero.id_potrero}: error al chequear cadencia`, error);
      continue;
    }
    if (!requiereEstimacion) continue;

    resultado.procesados += 1;
    try {
      const { omitida } = await generarEstimacionForrajera(potrero, { evitarDuplicados: true });
      if (omitida) {
        resultado.omitidos += 1;
      } else {
        resultado.generados += 1;
      }
    } catch (error) {
      resultado.errores += 1;
      if (error instanceof ModeloPredictivoError) {
        console.error(`[estimacionForrajeraCron] potrero ${potrero.id_potrero}: ${error.message}`);
      } else {
        console.error(`[estimacionForrajeraCron] potrero ${potrero.id_potrero}: error inesperado`, error);
      }
    }
  }

  return resultado;
}

let intervalo = null;

/**
 * Arranca el tick diario. Corre un ciclo de inmediato al iniciar (para no
 * esperar 24h antes de estimar un potrero recién creado) y después uno por
 * día. Idempotente: si ya está corriendo, no arranca un segundo intervalo.
 */
function iniciarSchedulerEstimacionForrajera() {
  if (intervalo) return intervalo;

  ejecutarCicloEstimacionForrajera().catch((error) => {
    console.error('[estimacionForrajeraCron] ciclo inicial falló', error);
  });

  intervalo = setInterval(() => {
    ejecutarCicloEstimacionForrajera().catch((error) => {
      console.error('[estimacionForrajeraCron] ciclo falló', error);
    });
  }, INTERVALO_TICK_MS);

  return intervalo;
}

function detenerSchedulerEstimacionForrajera() {
  if (intervalo) {
    clearInterval(intervalo);
    intervalo = null;
  }
}

module.exports = {
  CADENCIA_DIAS,
  necesitaEstimacion,
  ejecutarCicloEstimacionForrajera,
  iniciarSchedulerEstimacionForrajera,
  detenerSchedulerEstimacionForrajera,
};
