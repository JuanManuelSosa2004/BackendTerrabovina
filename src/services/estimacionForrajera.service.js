'use strict';

/**
 * Genera y persiste una estimación forrajera de un potrero: le pide al
 * modelo predictivo (servicio Flask externo) la imagen satelital, el vector
 * climático y la predicción de disponibilidad forrajera en una sola
 * llamada, y persiste ObservacionSatelital + DatoClimatico +
 * DisponibilidadForrajera juntas en una transacción.
 *
 * Extraído de estimacion.controller.js#crearEstimacionForrajera (#29) para
 * que el endpoint manual y el ciclo automático
 * (jobs/estimacionForrajeraCron.job.js) compartan la misma lógica de
 * persistencia en vez de duplicarla.
 */

const observacionSatelitalRepository = require('../database/sql/observacionSatelital.repository');
const datoClimaticoRepository = require('../database/sql/datoClimatico.repository');
const disponibilidadForrajeraRepository = require('../database/sql/disponibilidadForrajera.repository');
const { sequelize } = require('../database/sequelize');
const { toMysqlDatetimeUtc } = require('../utils/mysqlDate');
const { predictDmp } = require('./modeloPredictivo.client');

const VERSION_DMP = 'dmp-model';

/**
 * @param {{ id_potrero: number, nombre: string, geom: object, superficie_ha: number }} potrero
 * @param {{ evitarDuplicados?: boolean }} opciones
 *   evitarDuplicados: si la escena que devuelve el modelo tiene la misma
 *   fecha de captura que la última observación ya persistida del potrero,
 *   no inserta nada y devuelve { omitida: true }. Sentinel-2 revisita cada
 *   ~5 días, así que el ciclo automático puede caer en un día sin escena
 *   nueva; sin este chequeo insertaría una fila idéntica que no aporta
 *   ningún punto nuevo a balanceForrajero.service.js#integrarTasa.
 *
 *   El endpoint manual NO usa este chequeo (default false): si el
 *   productor pide una estimación explícitamente, se persiste la respuesta
 *   del modelo tal cual, sea o no la misma escena que la anterior.
 * @returns {Promise<{ omitida: true, motivo: string } | { omitida: false, observacion: object, clima: object, disponibilidad: object, dmp_kg_ms_ha_periodo: number }>}
 */
async function generarEstimacionForrajera(potrero, { evitarDuplicados = false } = {}) {
  const id_potrero = potrero.id_potrero;

  const respuestaModelo = await predictDmp({ nombre_potrero: potrero.nombre, geojson: potrero.geom });

  const {
    datos_imagen_satelital: imagen,
    feature_vector_enviado_al_modelo: features,
    prediccion: { dmp_kg_ms_ha_dia, dmp_kg_ms_ha_periodo },
  } = respuestaModelo;

  if (evitarDuplicados) {
    const ultima = await observacionSatelitalRepository.getUltimaByPotrero(id_potrero);
    if (ultima && aFechaISO(ultima.fecha) === aFechaISO(imagen.fecha_exacta_captura)) {
      return { omitida: true, motivo: 'sin escena nueva desde la última observación' };
    }
  }

  const { observacion, clima, disponibilidad } = await sequelize.transaction(async (t) => {
    const observacionCreada = await observacionSatelitalRepository.crearObservacion(
      {
        id_potrero,
        fuente: 'SENTINEL2',
        fecha: imagen.fecha_exacta_captura,
        ndvi: features.ndvi_promedio,
        nubosidad: imagen.nubosidad_pct,
        cobertura_suelo_mapbiomas: imagen.cobertura_suelo_mapbiomas,
      },
      t
    );

    const climaCreado = await datoClimaticoRepository.crearDato(
      {
        id_potrero,
        fuente: 'MODELO_PREDICTIVO',
        fecha: imagen.fecha_exacta_captura,
        temperatura: features.temperatura_media_del_dia,
        precipitacion: features.precipitacion_del_dia,
        humedad: features.humedad_relativa_del_dia,
      },
      t
    );

    const disponibilidadCreada = await disponibilidadForrajeraRepository.crear(
      {
        id_potrero,
        fecha_calculo: toMysqlDatetimeUtc(new Date()),
        kg_materia_seca_ha: dmp_kg_ms_ha_dia,
        superficie_analizada_ha: potrero.superficie_ha,
        indice_ndvi: features.ndvi_promedio,
        version_modelo: VERSION_DMP,
        nivel_confianza: null,
        id_observacion: observacionCreada.id_observacion,
      },
      t
    );

    return { observacion: observacionCreada, clima: climaCreado, disponibilidad: disponibilidadCreada };
  });

  return { omitida: false, observacion, clima, disponibilidad, dmp_kg_ms_ha_periodo };
}

// Normaliza a 'YYYY-MM-DD': la fecha ya persistida puede volver de MySQL
// como Date o como string según el driver, y la que manda el modelo viaja
// siempre como string. Comparar sin normalizar rompería el chequeo de
// duplicados con una diferencia de formato, no de fecha.
function aFechaISO(valor) {
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  return String(valor).slice(0, 10);
}

module.exports = { generarEstimacionForrajera, VERSION_DMP };
