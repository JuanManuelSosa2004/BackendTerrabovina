'use strict';

/**
 * A diferencia de disponibilidad forrajera y demanda nutricional (ahora
 * resueltas por el modelo predictivo real, ver
 * src/services/modeloPredictivo.client.js), la recomendación nunca fue un
 * modelo entrenado: es una regla de umbrales propia sobre "días de
 * pastoreo restantes" (RF009/RF010). Se mantiene acá, ya no junto a
 * heurísticas placeholder — el nombre del archivo queda por compatibilidad
 * con las rutas existentes.
 */

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

module.exports = { generarRecomendacion };
