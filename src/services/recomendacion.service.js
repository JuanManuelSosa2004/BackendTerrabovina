'use strict';

/**
 * Genera la recomendación de un potrero cruzando las dos estimaciones
 * vigentes (RF009). Reemplaza a estimaciones.placeholder.js, que resolvía la
 * decisión con umbrales sobre una cuenta dimensionalmente incorrecta: trataba
 * kg_materia_seca_ha como biomasa parada cuando el modelo entrega un caudal
 * (kg MS/ha/día contra Copernicus DMP), de modo que su cociente no eran días
 * sino el índice de balance, y los umbrales de 15 y 45 no tenían sentido.
 *
 * El flujo es: calculadora → motor de reglas → redactor. Este archivo es solo
 * la primera etapa más el armado del contexto; la decisión vive en
 * config/reglas.recomendacion.json.
 *
 * ALCANCE ACTUAL. El stock acumulado y la autonomía requieren la serie de la
 * ventana, cuya consulta todavía no existe. Se aceptan como parámetro opcional
 * (`stock`) y, cuando no llegan, las reglas resuelven con el índice de
 * balance, que opera con una sola observación. Ninguna regla los exige: un
 * potrero recién creado o con nubosidad persistente mantendrá la ventana
 * incompleta de todos modos.
 */

const {
  calcularBalance,
  calcularCarga,
  calcularAutonomia,
  resolverPerfil,
  acumularStock,
  construirConsumoDesdeAsignaciones,
  proyectarConsumoRetroactivo,
  ventanaDiasPara,
  parametros,
} = require('./balanceForrajero.service');
const { evaluar } = require('./motorReglas.service');
const disponibilidadForrajeraRepository = require('../database/sql/disponibilidadForrajera.repository');
const asignacionGanadoRepository = require('../database/sql/asignacionGanado.repository');
const observacionSatelitalRepository = require('../database/sql/observacionSatelital.repository');

const MS_POR_DIA = 86400000;

function diasDesde(valor) {
  if (!valor) return null;
  const t = valor instanceof Date ? valor.getTime() : new Date(valor).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, (Date.now() - t) / MS_POR_DIA);
}

function aFechaSql(t) {
  return new Date(t).toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Arma el stock del potrero integrando la ventana.
 *
 * La ventana es la que corresponde a la estación: más corta en primavera,
 * porque el pasto se encaña, y más larga en invierno, porque la senescencia se
 * frena. Sobre ese período se integran dos series: la oferta que estimó el
 * modelo y el consumo reconstruido desde las asignaciones.
 *
 * Devuelve null si no hay observaciones en el período. En ese caso el motor
 * resuelve con el índice de balance, que necesita una sola.
 */
async function calcularStockDePotrero({
  id_potrero,
  superficieHa,
  claseCobertura,
  consumoMedioAnimalKgDia,
  fechaAltaPotrero,
}) {
  const dias = ventanaDiasPara(claseCobertura, new Date());
  if (!dias) return null;

  const hastaMs = Date.now();
  const desdeMs = hastaMs - dias * MS_POR_DIA;
  const desde = aFechaSql(desdeMs);
  const hasta = aFechaSql(hastaMs);

  const [filas, asignaciones] = await Promise.all([
    disponibilidadForrajeraRepository.getHistoricoByPotrero(id_potrero, { desde, hasta }),
    asignacionGanadoRepository.getSolapadasEnVentana(id_potrero, { desde, hasta }),
  ]);

  if (!filas || filas.length === 0) return null;

  // La fecha de captura es la que ubica cada muestra en el tiempo. Las filas
  // anteriores a la migración 20260824000002 no la tienen, y para ellas la de
  // cálculo es lo mejor disponible.
  const observaciones = filas.map((f) => ({
    fecha: f.fecha_observacion ?? f.fecha_calculo,
    valor: f.kg_materia_seca_ha,
  }));

  const consumosRegistrados = construirConsumoDesdeAsignaciones({
    asignaciones,
    desde: desdeMs,
    hasta: hastaMs,
    consumoMedioAnimalKgDia,
  });

  // Un potrero registrado hace poco no tiene historial de asignaciones para
  // todo el período, y sin este tramo el cálculo asumiría que estuvo
  // descansando: diría que hay más pasto del que hay, que es el error que
  // conviene evitar.
  const { consumos, fraccionInferida } = proyectarConsumoRetroactivo({
    consumosRegistrados,
    desde: desdeMs,
    hasta: hastaMs,
    fechaAltaPotrero,
    demandaActualKgDia: consumosRegistrados.length
      ? consumosRegistrados[consumosRegistrados.length - 1].valor
      : null,
  });

  const stock = acumularStock({
    observaciones,
    consumos,
    superficieHa,
    desde: desdeMs,
    hasta: hastaMs,
    claseCobertura,
  });

  return stock ? { ...stock, fraccionInferida, ventanaDias: dias } : null;
}

/**
 * @param {object} disponibilidad fila de disponibilidad_forrajera. Se usa
 *   fecha_observacion (fecha de CAPTURA de la escena, incorporada por la
 *   migración 20260824000002) y no fecha_calculo: la primera describe el
 *   estado del pasto, la segunda solo cuándo corrió el modelo.
 * @param {object} estimacion fila de estimacion_demanda.
 * @param {number} superficie_ha superficie del potrero, no la analizada.
 * @param {string} [claseCobertura] clase de MapBiomas; determina el perfil de
 *   parámetros. Sin ella se aplica el perfil por defecto.
 * @param {object} [stock] salida de acumularStock, cuando la serie está
 *   disponible.
 * @param {string} [tipoAnterior] tipo de la última recomendación del potrero,
 *   necesario para la histéresis de la banda neutra.
 */
async function generarRecomendacion({
  disponibilidad,
  estimacion,
  potrero,
  superficie_ha,
  claseCobertura,
  stock = null,
  tipoAnterior = null,
}) {
  const superficieHa = superficie_ha ?? (potrero ? potrero.superficie_ha : null);

  // La cobertura se resuelve PRIMERO porque determina el factor de utilización
  // que aplica el balance. Viene de la última observación satelital cuando no
  // llega por parámetro.
  //
  // Que no se reconozca no bloquea la recomendación —sería demasiado estricto—
  // pero queda registrado: el perfil por defecto es pastizal natural, y
  // aplicarlo a una pastura subestima la oferta en un 10 %, que es la
  // diferencia entre sus factores de utilización.
  let cobertura = claseCobertura;
  if (!cobertura && potrero) {
    const ultima = await observacionSatelitalRepository.getUltimaByPotrero(potrero.id_potrero);
    cobertura = ultima ? ultima.clase_cobertura_mapbiomas : null;
  }
  const perfilResuelto = resolverPerfil(cobertura);

  const balance = calcularBalance({
    kgMsHaDia: disponibilidad.kg_materia_seca_ha,
    superficieHa,
    demandaTotalKgDia: estimacion.kg_materia_seca_dia,
    claseCobertura: perfilResuelto.clave,
  });

  const carga = calcularCarga({
    ofertaHaDia: balance ? balance.ofertaHaDia : null,
    demandaTotalKgDia: estimacion.kg_materia_seca_dia,
    cantidadAnimales: estimacion.cantidad_animales,
    superficieHa,
  });

  // Si no llegó armado desde afuera, se calcula acá.
  let stockCalculado = stock;
  if (!stockCalculado && potrero && carga && carga.consumoMedioAnimalKgDia) {
    stockCalculado = await calcularStockDePotrero({
      id_potrero: potrero.id_potrero,
      superficieHa,
      claseCobertura: perfilResuelto.clave,
      consumoMedioAnimalKgDia: carga.consumoMedioAnimalKgDia,
      fechaAltaPotrero: potrero.created_at ?? potrero.createdAt ?? null,
    });
  }

  const autonomia =
    stockCalculado && balance
      ? calcularAutonomia({
          stockKgMsHa: stockCalculado.stockKgMsHa,
          demandaHaDia: balance.demandaHaDia,
          ofertaHaDia: balance.ofertaHaDia,
          remanenteKgMsHa: stockCalculado.remanenteKgMsHa,
        })
      : null;

  stock = stockCalculado;

  const recomendacion = await evaluar({
    ofertaHaDia: balance ? balance.ofertaHaDia : null,
    demandaHaDia: balance ? balance.demandaHaDia : null,
    indiceBalance: balance ? balance.indiceBalance : null,
    potreroVacio: balance ? balance.potreroVacio : true,

    acumuladoNetoHa: stock ? stock.acumuladoNetoHa : null,
    enPiso: stock ? stock.enPiso : false,
    muestrasUsadas: stock ? stock.muestrasUsadas : null,
    huecoMaximoDias: stock ? stock.huecoMaximoDias : null,
    fraccionInferida: stock ? stock.fraccionInferida : null,

    diasAutonomia: autonomia ? autonomia.dias : null,
    superaTopeAutonomia: autonomia ? autonomia.superaTope : false,

    cantidadAnimales: estimacion.cantidad_animales,
    cargaSostenible: carga ? carga.cargaSostenible : null,
    excesoAnimales: carga ? carga.excesoAnimales : null,
    superficieRequeridaHa: carga ? carga.superficieRequeridaHa : null,

    diasDesdeObservacion: diasDesde(disponibilidad.fecha_observacion ?? disponibilidad.fecha_calculo),
    nivelConfianza: disponibilidad.nivel_confianza,
    confianzaMinima: parametros.umbrales.confianzaMinima,
    pesosFueraDeRango: estimacion.pesos_fuera_de_rango === true,

    coberturaReconocida: perfilResuelto.reconocida,
    perfilAplicado: perfilResuelto.clave,

    tipoAnterior,
  });

  // La regla comodín garantiza que siempre haya candidata, salvo que el
  // balance no se pueda calcular por falta de superficie válida.
  if (!recomendacion) {
    return {
      tipo: 'NUEVA_MEDICION',
      prioridad: 'MEDIA',
      descripcion: 'No fue posible calcular el balance del potrero.',
      fundamento:
        'Faltan datos para comparar la oferta con la demanda: verifique que el potrero tenga superficie declarada.',
      reglasDisparadas: [],
    };
  }

  return recomendacion;
}

module.exports = { generarRecomendacion };
