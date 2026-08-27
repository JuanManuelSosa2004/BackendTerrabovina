'use strict';

/**
 * Balance forrajero: cruza la oferta estimada por el modelo de disponibilidad
 * contra la demanda estimada por el modelo de consumo, y acumula el stock de
 * forraje en pie por ventana móvil.
 *
 * UNIDAD CANÓNICA: la hectárea.
 *
 * Las dos estimaciones llegan en espacios distintos:
 *   - DisponibilidadForrajera.kg_materia_seca_ha  → kg MS/ha/día  (intensiva)
 *   - EstimacionDemanda.kg_materia_seca_dia       → kg MS/día     (extensiva,
 *                                                    total del potrero)
 *
 * Se unifica llevando la demanda a hectárea y NO la oferta a total, de modo que
 * la salida del modelo entra al cálculo sin conversión intermedia. El índice de
 * balance resulta idéntico bajo cualquiera de las dos convenciones —la
 * superficie se cancela en el cociente—, así que la decisión es de
 * interpretabilidad: la hectárea es la unidad de la literatura agronómica,
 * hace comparables potreros de distinta superficie y habilita el control de
 * plausibilidad contra rangos publicados.
 *
 * Ver docs/estimacion-biomasa-parada.md §3.
 */

const parametros = require('../config/parametros.forrajeros.json');

// Sequelize devuelve DECIMAL como string. Todo lo que entre acá se normaliza.
function num(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/**
 * Estación del hemisferio sur para una fecha dada. Se usa para elegir la
 * ventana de acumulación, que es más corta en primavera (el forraje se encaña)
 * y más larga en invierno (la senescencia se frena).
 */
function estacionDe(fecha) {
  let mes;
  let dia;

  // 'YYYY-MM-DD' se resuelve sobre los componentes, sin construir un Date. El
  // parser de ISO trata la forma sin hora como UTC, de modo que en husos al
  // oeste de Greenwich el día se corre hacia atrás y las fechas de borde
  // caerían en la estación anterior.
  const soloFecha = typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}/.exec(fecha);
  if (soloFecha) {
    mes = Number(fecha.slice(5, 7));
    dia = Number(fecha.slice(8, 10));
  } else {
    const d = fecha instanceof Date ? fecha : new Date(fecha);
    if (Number.isNaN(d.getTime())) return null;
    mes = d.getMonth() + 1;
    dia = d.getDate();
  }

  if (!mes || !dia) return null;
  const clave = mes * 100 + dia;
  if (clave >= 921 && clave <= 1220) return 'primavera';
  if (clave >= 1221 || clave <= 320) return 'verano';
  if (clave >= 321 && clave <= 620) return 'otonio';
  return 'invierno';
}

function perfilPara(claseCobertura) {
  const perfiles = parametros.perfiles;
  return perfiles[claseCobertura] || perfiles[parametros.perfilPorDefecto];
}

/**
 * Días de ventana para un potrero en una fecha, acotados por el tope
 * calendario. El tope evita que un invierno frío deje la ventana abierta de
 * forma indefinida.
 */
function ventanaDiasPara(claseCobertura, fecha) {
  const estacion = estacionDe(fecha);
  if (!estacion) return null;
  const perfil = perfilPara(claseCobertura);
  return Math.min(perfil.ventanaDias[estacion], parametros.ventanaMaximaDias);
}

/**
 * Balance instantáneo entre oferta y demanda, en kg MS/ha/día.
 *
 * Devuelve null si falta la superficie: sin ella la demanda extensiva no puede
 * llevarse a hectárea y no hay comparación posible.
 *
 * Un potrero sin animales asignados devuelve indiceBalance null y
 * potreroVacio true: el cociente no está definido y no corresponde forzarlo a
 * infinito, porque las reglas necesitan distinguir "sin demanda" de "oferta
 * muy superior a la demanda".
 */
function calcularBalance({ kgMsHaDia, superficieHa, demandaTotalKgDia, claseCobertura, factorUtilizacion }) {
  const oferta = num(kgMsHaDia);
  const superficie = num(superficieHa);
  const demandaTotal = num(demandaTotalKgDia);

  if (oferta === null || superficie === null || superficie <= 0) return null;

  const U = num(factorUtilizacion) ?? perfilPara(claseCobertura).factorUtilizacion;

  const ofertaHaDia = oferta * U;
  const demandaHaDia = demandaTotal === null ? 0 : demandaTotal / superficie;
  const potreroVacio = demandaHaDia <= 0;

  return {
    ofertaBrutaHaDia: oferta,
    factorUtilizacion: U,
    ofertaHaDia,
    demandaHaDia,
    indiceBalance: potreroVacio ? null : ofertaHaDia / demandaHaDia,
    potreroVacio,
  };
}

function aMs(fecha) {
  if (fecha instanceof Date) return fecha.getTime();
  const t = new Date(fecha).getTime();
  return Number.isNaN(t) ? null : t;
}

const MS_POR_DIA = 86400000;

function ordenarMuestras(muestras) {
  return muestras
    .map((m) => ({ t: aMs(m.fecha), valor: num(m.valor) }))
    .filter((m) => m.t !== null && m.valor !== null)
    .sort((a, b) => a.t - b.t);
}

/**
 * Integra una TASA muestreada de forma irregular, por trapecios.
 *
 * Las filas de disponibilidad_forrajera se crean a demanda, no por cron, y
 * Sentinel-2 revisita cada cinco días: la serie nunca es diaria ni regular. En
 * una ventana de sesenta días hay del orden de ocho a doce observaciones
 * utilizables, no sesenta. Sumar valores como si fueran días sobrestima o
 * subestima según la separación entre muestras; integrar por trapecios entre
 * observaciones consecutivas es el tratamiento correcto de una tasa muestreada
 * en instantes discretos.
 *
 * Fuera del rango cubierto por las muestras se extiende el valor del extremo
 * más cercano. La fracción de ventana resuelta de ese modo se informa aparte
 * para que la compuerta de confianza pueda leerla.
 *
 * @returns {{ integral: number, huecoMaximoDias: number, muestrasUsadas: number,
 *             diasExtrapolados: number, ventanaDias: number }}
 */
function integrarTasa({ muestras, desde, hasta }) {
  if (!Array.isArray(muestras)) return null;
  const t0 = aMs(desde);
  const t1 = aMs(hasta);
  if (t0 === null || t1 === null || t1 <= t0) return null;

  const puntos = ordenarMuestras(muestras).filter((m) => m.t >= t0 && m.t <= t1);
  if (puntos.length === 0) return null;

  const ventanaDias = (t1 - t0) / MS_POR_DIA;
  let integral = 0;
  let huecoMaximoDias = 0;

  // Tramo inicial: desde el borde de la ventana hasta la primera muestra.
  const diasCabeza = (puntos[0].t - t0) / MS_POR_DIA;
  integral += puntos[0].valor * diasCabeza;

  for (let i = 0; i < puntos.length - 1; i += 1) {
    const dias = (puntos[i + 1].t - puntos[i].t) / MS_POR_DIA;
    integral += ((puntos[i].valor + puntos[i + 1].valor) / 2) * dias;
    if (dias > huecoMaximoDias) huecoMaximoDias = dias;
  }

  // Tramo final: desde la última muestra hasta el borde de la ventana.
  const ultimo = puntos[puntos.length - 1];
  const diasCola = (t1 - ultimo.t) / MS_POR_DIA;
  integral += ultimo.valor * diasCola;

  return {
    integral,
    huecoMaximoDias,
    muestrasUsadas: puntos.length,
    diasExtrapolados: diasCabeza + diasCola,
    ventanaDias,
  };
}

/**
 * Integra una función ESCALÓN muestreada en los instantes en que cambia.
 *
 * El consumo no se interpola: la carga de un potrero cambia de golpe el día que
 * entran o salen animales, y AsignacionGanado registra esos instantes con
 * fecha_desde y fecha_hasta. Cada tramo vale su valor exacto hasta el cambio
 * siguiente, de modo que la integral es exacta y no aproximada.
 *
 * Antes de la primera muestra se asume consumo nulo: si no hay registro de
 * asignación, el potrero estaba vacío.
 */
function integrarEscalon({ muestras, desde, hasta }) {
  const t0 = aMs(desde);
  const t1 = aMs(hasta);
  if (t0 === null || t1 === null || t1 <= t0) return null;
  if (!Array.isArray(muestras) || muestras.length === 0) return { integral: 0, tramos: 0 };

  const puntos = ordenarMuestras(muestras).filter((m) => m.t <= t1);
  if (puntos.length === 0) return { integral: 0, tramos: 0 };

  let integral = 0;
  let tramos = 0;

  for (let i = 0; i < puntos.length; i += 1) {
    const inicio = Math.max(puntos[i].t, t0);
    const fin = i + 1 < puntos.length ? Math.min(puntos[i + 1].t, t1) : t1;
    if (fin <= inicio) continue;
    integral += puntos[i].valor * ((fin - inicio) / MS_POR_DIA);
    tramos += 1;
  }

  return { integral, tramos };
}

/**
 * Stock de forraje en pie por acumulación en ventana móvil, en kg MS/ha.
 *
 * El forraje producido no permanece disponible de manera indefinida: madura,
 * senesce y deja de ser aprovechable. La ventana representa ese horizonte de
 * vida útil y se corresponde con el período de descanso del pastoreo rotativo.
 *
 * La ventana móvil le da al método una propiedad valiosa: cualquier error
 * introducido abandona el cálculo transcurridos X días, así que el desvío no se
 * acumula de forma indefinida.
 *
 * @param observaciones [{ fecha, valor }] — valor en kg MS/ha/día, tal como lo
 *        devuelve el modelo. La fecha debe ser la de captura de la imagen, no
 *        la de cálculo: describen momentos distintos y pueden diferir días.
 * @param consumos [{ fecha, valor }] — valor en kg MS/día del potrero entero,
 *        muestreado en cada cambio de asignación.
 */
function acumularStock({
  observaciones,
  consumos,
  superficieHa,
  desde,
  hasta,
  claseCobertura,
  factorUtilizacion,
  remanenteKgMsHa,
  umbralPisoKgMsHa,
}) {
  const superficie = num(superficieHa);
  if (superficie === null || superficie <= 0) return null;

  const perfil = perfilPara(claseCobertura);
  const U = num(factorUtilizacion) ?? perfil.factorUtilizacion;
  const R = num(remanenteKgMsHa) ?? perfil.remanenteKgMsHa;

  const oferta = integrarTasa({ muestras: observaciones, desde, hasta });
  if (!oferta) return null;

  const consumo = integrarEscalon({ muestras: consumos ?? [], desde, hasta }) ?? { integral: 0, tramos: 0 };

  const ofertaAcumuladaHa = oferta.integral * U;
  const consumoAcumuladoHa = consumo.integral / superficie;

  // La condición inicial de la ventana es el remanente, no cero: X días atrás
  // el potrero no estaba pelado. Lo que la ventana acumula es el forraje ÚTIL
  // producido por encima de ese piso y todavía no consumido ni senescido. El
  // material anterior a la ventana quedó fuera por senescencia, que es
  // precisamente el supuesto que la ventana representa.
  // Se devuelven los dos: el neto sin acotar y el útil con el piso aplicado.
  //
  // Un neto negativo significa que en la ventana se consumió más de lo que
  // creció, y eso solo puede provenir de forraje que ya estaba en pie al
  // comenzar el período. Como el modelo asume que ese material había
  // senescido, la discrepancia informa una de dos cosas: la ventana quedó
  // corta para ese potrero, o las estimaciones no describen bien su situación.
  //
  // El `max` mantiene el stock físicamente válido —no puede haber menos
  // forraje que el remanente— pero al hacerlo pierde esa señal. De ahí que el
  // neto se conserve: su magnitud distingue el ruido de estimación de un
  // potrero mal modelado, y un potrero que arroja neto negativo evaluación
  // tras evaluación es un problema de calibración y no de manejo.
  const acumuladoNetoHa = ofertaAcumuladaHa - consumoAcumuladoHa;
  const acumuladoUtilHa = Math.max(0, acumuladoNetoHa);

  return {
    stockKgMsHa: R + acumuladoUtilHa,
    acumuladoNetoHa,
    acumuladoUtilHa,
    enPiso: acumuladoNetoHa < (num(umbralPisoKgMsHa) ?? 0),
    remanenteKgMsHa: R,
    ofertaAcumuladaHa,
    consumoAcumuladoHa,
    tocaPiso: acumuladoUtilHa === 0,
    // Densidad de datos: la compuerta de confianza las lee para decidir si la
    // estimación se sostiene o corresponde emitir NUEVA_MEDICION.
    muestrasUsadas: oferta.muestrasUsadas,
    huecoMaximoDias: oferta.huecoMaximoDias,
    diasExtrapolados: oferta.diasExtrapolados,
    ventanaDias: oferta.ventanaDias,
    tramosConsumo: consumo.tramos,
  };
}

/**
 * Días que la carga actual se sostiene con el stock disponible.
 *
 * El divisor es la tasa de vaciado NETA (demanda menos oferta), no la demanda
 * sola: mientras los animales comen, el potrero sigue produciendo. Dividir por
 * la demanda sola subestima la autonomía en proporción a lo que el potrero
 * crece, y en un potrero cercano al equilibrio el error es de varias veces.
 *
 * Se descuenta el remanente porque ese forraje no está efectivamente
 * disponible: por debajo de ese nivel el peso del bocado cae y el consumo se
 * degrada.
 *
 * Devuelve `{ dias, enSuperavit }`:
 *   - dias null + enSuperavit true  → la oferta cubre la demanda; el stock no
 *     se vacía y la autonomía no tiene límite bajo las condiciones actuales.
 *   - dias null + enSuperavit false → faltan datos para calcularla.
 *
 * ADVERTENCIA: supone oferta y demanda constantes hacia adelante. Es una
 * proyección por persistencia. Ver docs/estimacion-biomasa-parada.md sobre la
 * distinción entre ventana histórica y horizonte de proyección.
 */
function calcularAutonomia({ stockKgMsHa, demandaHaDia, ofertaHaDia, remanenteKgMsHa, topeDias }) {
  const stock = num(stockKgMsHa);
  const demanda = num(demandaHaDia);
  const oferta = num(ofertaHaDia) ?? 0;
  const R = num(remanenteKgMsHa) ?? 0;
  const tope = num(topeDias) ?? parametros.umbrales.autonomiaMaximaInformadaDias;

  if (stock === null || demanda === null || demanda <= 0) {
    return { dias: null, enSuperavit: false, superaTope: false };
  }

  const vaciadoNetoHaDia = demanda - oferta;
  if (vaciadoNetoHaDia <= 0) {
    return { dias: null, enSuperavit: true, superaTope: false, vaciadoNetoHaDia };
  }

  const disponible = stock - R;
  const crudo = disponible <= 0 ? 0 : disponible / vaciadoNetoHaDia;
  const superaTope = crudo > tope;

  return {
    // Se informa acotada. A medida que el potrero se acerca al equilibrio el
    // divisor tiende a cero y el cociente se dispara: con índice de balance
    // 0,98 un error del 1% en oferta o en demanda mueve el resultado un 50%.
    // Además una autonomía de varios meses no es accionable —nadie planifica a
    // ese plazo y el pasto de hoy no va a estar— así que el tope resuelve el
    // problema numérico y el comunicacional a la vez.
    dias: superaTope ? tope : crudo,
    diasSinTope: crudo,
    superaTope,
    topeDias: tope,
    enSuperavit: false,
    vaciadoNetoHaDia,
  };
}

/**
 * Antepone el consumo inferido del tramo de ventana anterior al alta del
 * potrero.
 *
 * Un potrero registrado hoy no tiene historial de asignaciones, pero la ventana
 * mira 38 a 90 días hacia atrás. Sin este tramo, integrarEscalon asume consumo
 * cero para todo ese período y el sistema calcula como si el potrero hubiera
 * estado descansando: sobrestima el forraje disponible, que es la dirección
 * peligrosa del error.
 *
 * Se proyecta hacia atrás la carga actual, que el productor ya cargó al asignar
 * hacienda. No es más "verdadero" que asumir cero, pero falla del lado que no
 * lastima —si el potrero venía descansando, subestima— y se corrige solo: a
 * medida que pasan los días el historial real desplaza al inferido, y cumplida
 * la ventana no queda nada proyectado.
 *
 * La fracción inferida se devuelve aparte para que la compuerta la lea y el
 * fundamento de la recomendación pueda declararla.
 */
function proyectarConsumoRetroactivo({
  consumosRegistrados,
  desde,
  hasta,
  fechaAltaPotrero,
  demandaActualKgDia,
}) {
  const registrados = Array.isArray(consumosRegistrados) ? consumosRegistrados : [];
  const t0 = aMs(desde);
  const t1 = aMs(hasta);
  const demandaActual = num(demandaActualKgDia);

  if (t0 === null || t1 === null || t1 <= t0) {
    return { consumos: registrados, fraccionInferida: 0, diasInferidos: 0 };
  }

  const ventanaDias = (t1 - t0) / MS_POR_DIA;

  // Sin carga actual no hay nada que proyectar: un potrero sin hacienda
  // asignada probablemente estuvo vacío, y asumir cero es correcto.
  if (demandaActual === null || demandaActual <= 0) {
    return { consumos: registrados, fraccionInferida: 0, diasInferidos: 0 };
  }

  // El tramo inferido termina donde arranca la evidencia: el alta del potrero
  // o la primera asignación registrada, lo que ocurra primero.
  const tAlta = aMs(fechaAltaPotrero);
  const primerRegistro = ordenarMuestras(registrados)[0]?.t ?? null;
  const candidatos = [tAlta, primerRegistro].filter((t) => t !== null);
  const tCorte = candidatos.length ? Math.min(...candidatos) : t1;

  if (tCorte <= t0) {
    // El potrero ya existía antes de la ventana: todo el período tiene
    // historial y no hay nada que inferir.
    return { consumos: registrados, fraccionInferida: 0, diasInferidos: 0 };
  }

  const fin = Math.min(tCorte, t1);
  const diasInferidos = (fin - t0) / MS_POR_DIA;

  return {
    consumos: [{ fecha: new Date(t0), valor: demandaActual, inferido: true }, ...registrados],
    fraccionInferida: Math.min(diasInferidos / ventanaDias, 1),
    diasInferidos,
  };
}

/**
 * Cobertura efectiva de la estimación: qué fracción del potrero pudo analizar
 * el modelo. No es un factor de conversión —para llevar la demanda a hectárea
 * va la superficie del potrero, porque los animales pastorean el potrero
 * entero— sino un indicador de calidad que alimenta la compuerta de confianza.
 */
function coberturaEstimacion({ superficieAnalizadaHa, superficieHa }) {
  const analizada = num(superficieAnalizadaHa);
  const total = num(superficieHa);
  if (analizada === null || total === null || total <= 0) return null;
  return Math.min(analizada / total, 1);
}

module.exports = {
  calcularBalance,
  acumularStock,
  integrarTasa,
  integrarEscalon,
  proyectarConsumoRetroactivo,
  calcularAutonomia,
  coberturaEstimacion,
  ventanaDiasPara,
  estacionDe,
  perfilPara,
  parametros,
};
