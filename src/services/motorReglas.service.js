'use strict';

/**
 * Motor de reglas de recomendación.
 *
 * El módulo no decide por sí mismo: la calculadora
 * (balanceForrajero.service.js) produce indicadores, este motor los evalúa
 * contra reglas declaradas en config/reglas.recomendacion.json, y el redactor
 * arma el fundamento con la plantilla de la regla ganadora. La inteligencia
 * vive en configuración legible y modificable sin tocar código, que es lo que
 * sostiene la explicabilidad declarada como diferencial del proyecto.
 *
 * Antecedente: OVINOPRO (Yagüe, PFI UADE 2024) resuelve su sistema experto con
 * esta misma biblioteca. La diferencia de aplicación importa: allí el motor
 * DESCRIBE un estado a partir de datos ya cargados, con reglas de un hecho
 * contra un umbral que disparan todas a la vez sin conflicto. Acá DECIDE una
 * acción a partir de dos magnitudes estimadas, y como un potrero admite una
 * sola instrucción hace falta resolver el conflicto entre reglas que se
 * cumplen simultáneamente.
 */

const { Engine } = require('json-rules-engine');
const reglas = require('../config/reglas.recomendacion.json');

// json-rules-engine compara con los operadores de JavaScript, donde null se
// coacciona a 0: una condición `indiceBalance < 0.9` daría verdadera sobre un
// potrero vacío, cuyo índice no está definido. Por eso cada hecho numérico que
// puede faltar viaja con un booleano de presencia, y las reglas lo consultan
// antes de comparar el número.
function esNumero(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Traduce la salida de la calculadora al conjunto de hechos que las reglas
 * consultan. Es el único lugar donde se decide qué ve el motor.
 *
 * @param {object} indicadores salida combinada de calcularBalance,
 *        acumularStock, calcularAutonomia y calcularCarga, más el contexto del
 *        potrero (antigüedad de la observación, confianza, tipo anterior).
 */
function construirHechos(indicadores) {
  const {
    ofertaHaDia,
    demandaHaDia,
    indiceBalance,
    potreroVacio,
    acumuladoNetoHa,
    enPiso,
    diasAutonomia,
    superaTopeAutonomia,
    cantidadAnimales,
    cargaSostenible,
    excesoAnimales,
    superficieRequeridaHa,
    diasDesdeObservacion,
    nivelConfianza,
    confianzaMinima,
    pesosFueraDeRango,
    fraccionInferida,
    muestrasUsadas,
    huecoMaximoDias,
    tipoAnterior,
  } = indicadores;

  return {
    ofertaHaDia: esNumero(ofertaHaDia) ? ofertaHaDia : 0,
    demandaHaDia: esNumero(demandaHaDia) ? demandaHaDia : 0,

    tieneIndice: esNumero(indiceBalance),
    indiceBalance: esNumero(indiceBalance) ? indiceBalance : 0,
    potreroVacio: potreroVacio === true,

    acumuladoNetoHa: esNumero(acumuladoNetoHa) ? acumuladoNetoHa : 0,
    enPiso: enPiso === true,

    tieneAutonomia: esNumero(diasAutonomia),
    diasAutonomia: esNumero(diasAutonomia) ? diasAutonomia : 0,
    superaTopeAutonomia: superaTopeAutonomia === true,

    cantidadAnimales: esNumero(cantidadAnimales) ? cantidadAnimales : 0,
    cargaSostenible: esNumero(cargaSostenible) ? cargaSostenible : 0,
    excesoAnimales: esNumero(excesoAnimales) ? excesoAnimales : 0,
    superficieRequeridaHa: esNumero(superficieRequeridaHa) ? superficieRequeridaHa : 0,

    // Sin observación previa se asume vencida: es el lado seguro.
    diasDesdeObservacion: esNumero(diasDesdeObservacion) ? diasDesdeObservacion : Infinity,
    // El modelo persiste nivel_confianza en null, de modo que la ausencia del
    // dato no puede tratarse como confianza insuficiente o la compuerta
    // bloquearía todas las recomendaciones.
    confianzaInsuficiente:
      esNumero(nivelConfianza) && esNumero(confianzaMinima) ? nivelConfianza < confianzaMinima : false,
    pesosFueraDeRango: pesosFueraDeRango === true,

    fraccionInferida: esNumero(fraccionInferida) ? fraccionInferida : 0,
    muestrasUsadas: esNumero(muestrasUsadas) ? muestrasUsadas : 0,
    huecoMaximoDias: esNumero(huecoMaximoDias) ? huecoMaximoDias : 0,

    tipoAnterior: typeof tipoAnterior === 'string' ? tipoAnterior : null,
  };
}

let motor = null;

/**
 * Instancia el motor con las reglas del archivo. Reinstancia en cada llamada,
 * de modo que editar el JSON y volver a cargar surte efecto sin reiniciar el
 * proceso — mismo criterio que OVINOPRO.
 */
function cargarReglas(definiciones = reglas) {
  motor = new Engine();
  for (const regla of definiciones) {
    const { _nota, ...limpia } = regla;
    motor.addRule(limpia);
  }
  return motor;
}

function obtenerMotor() {
  return motor ?? cargarReglas();
}

// Formato de los valores que se interpolan en el fundamento. Los decimales
// largos de un cálculo en punto flotante no aportan nada al productor.
function formatear(clave, valor) {
  if (valor === null || valor === undefined) return '—';
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return String(valor);
  if (clave === 'pctCobertura') return String(Math.round(valor));
  if (/animales|cargaSostenible|margenAnimales|cantidadAnimales/i.test(clave)) {
    return String(Math.round(Math.abs(valor)));
  }
  if (/dias/i.test(clave)) return String(Math.round(valor));
  return valor.toFixed(1).replace('.', ',');
}

/**
 * Rellena la plantilla de la regla ganadora. Nunca se genera texto libre: el
 * fundamento siempre menciona los números que lo justifican, dos
 * recomendaciones del mismo tipo se leen igual, y recalcular con los mismos
 * datos produce el mismo texto.
 */
function redactar(plantilla, hechos, derivados) {
  const fuente = { ...hechos, ...derivados };
  return plantilla.replace(/\{(\w+)\}/g, (_, clave) => formatear(clave, fuente[clave]));
}

/**
 * Evalúa los indicadores y devuelve una única recomendación.
 *
 * json-rules-engine dispara TODAS las reglas que se cumplen, igual que en
 * OVINOPRO. Como un potrero admite una sola instrucción, se ordena por el
 * campo `orden` de la acción y se toma la primera. Las demás no se descartan:
 * viajan en `reglasDisparadas` para que quede registro de qué otras
 * condiciones estaban dadas en ese momento, que es trazabilidad por encima de
 * lo que pide RNF007.
 */
async function evaluar(indicadores) {
  const hechos = construirHechos(indicadores);
  const { events } = await obtenerMotor().run(hechos);

  const candidatas = events.map((e) => e.params).filter(Boolean);
  if (candidatas.length === 0) return null;

  const elegida = [...candidatas].sort((a, b) => a.orden - b.orden)[0];

  const derivados = {
    pctCobertura: hechos.tieneIndice ? hechos.indiceBalance * 100 : null,
    margenAnimales: hechos.excesoAnimales < 0 ? -hechos.excesoAnimales : 0,
  };

  return {
    tipo: elegida.tipo,
    prioridad: elegida.prioridad,
    descripcion: elegida.descripcion,
    fundamento: redactar(elegida.plantilla, hechos, derivados),
    reglasDisparadas: events.map((e) => e.params.tipo),
    hechos,
  };
}

module.exports = { evaluar, construirHechos, cargarReglas, redactar, formatear };
