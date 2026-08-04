'use strict';

/**
 * Los modelos entrenados (regresión Ridge para demanda nutricional, §3.8
 * del PFI; el de disponibilidad forrajera ni siquiera está entrenado
 * todavía, §3.11) son artefactos Python/scikit-learn que viven fuera de
 * este backend, en el módulo desacoplado "Modelos Predictivos" (RNF013).
 * Esta implementación es una heurística simple y documentada — no el
 * modelo real — que mantiene el pipeline funcional de punta a punta hasta
 * integrar el artefacto entrenado. Se identifica con una versión de
 * modelo que empieza con "placeholder-" para que nunca se confunda con un
 * resultado del modelo real (docs/backend-gap-analysis.md §8).
 */

const VERSION_DISPONIBILIDAD = 'placeholder-forraje-v0';
const VERSION_DEMANDA = 'placeholder-dmi-v0';

// Consumo diario como % del peso vivo por categoría, aproximado a partir
// de los valores medios reportados en el PFI (§3.7.6 de TerraBovina_50_V2):
// Ternero/Ternera ~3,16 %, Toro ~1,99 %, el resto en un rango intermedio.
const PORCENTAJE_PESO_VIVO_POR_CATEGORIA = {
  TERNERO: 0.032,
  'TERNERO/TERNERA': 0.032,
  VAQUILLONA: 0.028,
  NOVILLO: 0.028,
  VACA: 0.025,
  TORO: 0.02,
};
const PORCENTAJE_PESO_VIVO_DEFAULT = 0.025;

// RF004: traduce NDVI (auxiliado por datos climáticos) en materia seca
// disponible por hectárea. Factor lineal simple; la precipitación reciente
// se usa como corrector menor, no como variable dominante.
function calcularDisponibilidadForrajera({ ndvi, precipitacion }) {
  const ndviEfectivo = Math.max(0, Number(ndvi) || 0);
  const factorPrecipitacion = 1 + Math.min(Number(precipitacion) || 0, 10) / 100;
  const kg_materia_seca_ha = Number((ndviEfectivo * 3000 * factorPrecipitacion).toFixed(2));

  return {
    kg_materia_seca_ha,
    version_modelo: VERSION_DISPONIBILIDAD,
    nivel_confianza: 0.3,
  };
}

// RF008: consumo diario de materia seca agregado del ganado de un potrero.
function calcularDemandaGanado(listaGanado) {
  const kg_materia_seca_dia = listaGanado.reduce((total, animal) => {
    const pct = PORCENTAJE_PESO_VIVO_POR_CATEGORIA[animal.categoria] ?? PORCENTAJE_PESO_VIVO_DEFAULT;
    return total + Number(animal.peso_kg || 0) * pct;
  }, 0);

  return {
    cantidad_animales: listaGanado.length,
    kg_materia_seca_dia: Number(kg_materia_seca_dia.toFixed(2)),
    version_modelo: VERSION_DEMANDA,
    nivel_confianza: 0.3,
  };
}

// RF009/RF010: cruza oferta y demanda de un potrero y decide tipo y
// prioridad con umbrales simples sobre los "días de pastoreo restantes"
// (oferta total / consumo diario). Regla de decisión ilustrativa, no el
// motor de reglas JSON descripto en §3.3.2 del PFI.
function generarRecomendacion({ disponibilidad, estimacion, superficie_ha }) {
  const superficie = Number(superficie_ha) || 1;
  const ofertaTotal = Number(disponibilidad.kg_materia_seca_ha) * superficie;
  const demandaDiaria = Number(estimacion.kg_materia_seca_dia);
  const diasPastoreoRestantes = demandaDiaria > 0 ? ofertaTotal / demandaDiaria : Infinity;

  let tipo;
  let prioridad;
  if (diasPastoreoRestantes < 15) {
    tipo = 'REDUCIR_CARGA';
    prioridad = '1'; // más urgente
  } else if (diasPastoreoRestantes > 45) {
    tipo = 'AUMENTAR_CARGA';
    prioridad = '3'; // menos urgente
  } else {
    tipo = 'MANTENER';
    prioridad = '2';
  }

  const dias = Number.isFinite(diasPastoreoRestantes) ? diasPastoreoRestantes.toFixed(1) : '∞';
  const fundamento =
    `Oferta estimada: ${ofertaTotal.toFixed(2)} kg MS (${disponibilidad.kg_materia_seca_ha} kg MS/ha × ` +
    `${superficie} ha). Demanda estimada: ${demandaDiaria.toFixed(2)} kg MS/día (${estimacion.cantidad_animales} ` +
    `animal(es)). Días de pastoreo restantes al ritmo actual: ${dias}.`;

  return {
    tipo,
    prioridad,
    descripcion: `Carga animal en relación ${tipo === 'MANTENER' ? 'equilibrada' : tipo === 'REDUCIR_CARGA' ? 'de sobrepoblamiento' : 'de subpoblamiento'} respecto de la oferta forrajera.`,
    fundamento,
  };
}

module.exports = { calcularDisponibilidadForrajera, calcularDemandaGanado, generarRecomendacion };
