'use strict';

const potreroRepository = require('../database/sql/potrero.repository');
const ganadoRepository = require('../database/sql/ganado.repository');
const observacionSatelitalRepository = require('../database/sql/observacionSatelital.repository');
const datoClimaticoRepository = require('../database/sql/datoClimatico.repository');
const disponibilidadForrajeraRepository = require('../database/sql/disponibilidadForrajera.repository');
const estimacionDemandaRepository = require('../database/sql/estimacionDemanda.repository');
const estimacionStockRepository = require('../database/sql/estimacionStock.repository');
const { sequelize } = require('../database/sequelize');
const { toMysqlDatetimeUtc } = require('../utils/mysqlDate');
const { predictDmp, predictDmi, predictStock, ModeloPredictivoError } = require('../services/modeloPredictivo.client');

const VERSION_DMP = 'dmp-model';
const VERSION_DMI = 'dmi-model';

// Claves reales del modelo (metadata de dmi_model.joblib), no coinciden
// 1 a 1 con GanadoCategoria: mandar 'Ternero' o 'Vaquillona' pegaba un
// KeyError (HTTP 500) en /predict/dmi para el lote completo.
const CATEGORIA_A_MODELO = {
  TERNERO: 'Ternero/Ternera',
  VAQUILLONA: 'Vaquilla',
  NOVILLO: 'Novillo',
  VACA: 'Vaca',
  TORO: 'Toro',
};

// Limitaciones fijas del modelo (campo `limitations` de dmi_model.joblib
// v1.0.0, entrenado 2026-07-23 sobre datos de Bomet, Kenia). La API del
// modelo no las expone en /predict/dmi, así que se declaran acá; no
// dependen de si algún animal está fuera de rango, por eso van aparte de
// `advertencias`. Revisar si cambian cuando el modelo se reentrene.
const LIMITACIONES_MODELO_DMI = [
  'El modelo fue entrenado con datos de sistemas productivos de Bomet, Kenia, no de Argentina.',
  'No incluye clima, calidad ni disponibilidad del forraje como variables.',
  'Debe validarse con datos locales antes de usarse para decisiones nutricionales reales en Argentina.',
];

// #29: RF003/RF004 — le pide al modelo predictivo (servicio Flask externo,
// ver docs/Screenshot_2.png) la imagen satelital, el vector climático y la
// predicción de disponibilidad forrajera de este potrero en una sola
// llamada, y persiste las tres piezas (ObservacionSatelital, DatoClimatico,
// DisponibilidadForrajera) juntas en una transacción. Si el modelo no
// responde, no se inserta nada: la última fila persistida sigue siendo la
// vigente para los GET de NDVI/clima (RNF003) — no se fabrica un dato.
async function crearEstimacionForrajera(req, res) {
  const id_potrero = req.potrero.id_potrero;
  const potrero = await potreroRepository.getPotreroById(id_potrero);

  let respuestaModelo;
  try {
    respuestaModelo = await predictDmp({ nombre_potrero: potrero.nombre, geojson: potrero.geom });
  } catch (error) {
    if (error instanceof ModeloPredictivoError) {
      return res.status(502).json({ error: error.message });
    }
    throw error;
  }

  const {
    datos_imagen_satelital: imagen,
    feature_vector_enviado_al_modelo: features,
    prediccion: { dmp_kg_ms_ha_dia, dmp_kg_ms_ha_periodo },
  } = respuestaModelo;

  const { observacion, clima, disponibilidad } = await sequelize.transaction(async (t) => {
    const observacionCreada = await observacionSatelitalRepository.crearObservacion(
      {
        id_potrero,
        fuente: 'SENTINEL2',
        fecha: imagen.fecha_exacta_captura,
        ndvi: features.ndvi_promedio,
        nubosidad: imagen.nubosidad_pct,
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
      },
      t
    );

    return { observacion: observacionCreada, clima: climaCreado, disponibilidad: disponibilidadCreada };
  });

  // dmp_kg_ms_ha_periodo no tiene columna propia todavía (no hace falta
  // persistirlo por ahora); viaja en la respuesta para no perderlo.
  return res.status(201).json({ ...disponibilidad, dmp_kg_ms_ha_periodo, observacion, clima });
}

// #30
async function historicoForrajera(req, res) {
  const historico = await disponibilidadForrajeraRepository.getHistoricoByPotrero(req.potrero.id_potrero, req.query);
  if (historico.length === 0) {
    return res.json({ disponibilidad: [], mensaje: 'No hay datos de disponibilidad forrajera en el rango solicitado.' });
  }
  return res.json({ disponibilidad: historico });
}

function aAnimalDelModelo(ganado) {
  const animal = {
    animal_id: String(ganado.id_ganado),
    peso_vivo_kg: Number(ganado.peso_kg),
    categoria_terrabovina: CATEGORIA_A_MODELO[ganado.categoria] ?? ganado.categoria,
  };
  if (ganado.condicion_corporal !== null && ganado.condicion_corporal !== undefined) {
    animal.condicion_corporal = Number(ganado.condicion_corporal);
  }
  if (ganado.estado_fisiologico && ganado.estado_fisiologico !== 'DESCONOCIDO') {
    animal.estado_fisiologico_norm = ganado.estado_fisiologico;
  }
  return animal;
}

// #31: RF008 — demanda nutricional agregada del ganado con asignación
// vigente en el potrero. El modelo predice por animal (docs/Screenshot_1.
// png); acá se suma su dmi_kg_dia para obtener el agregado que pide el
// DER (EstimacionDemanda no tiene detalle por animal, ver
// docs/backend-gap-analysis.md §3 nota sobre el #33 descartado). Las
// advertencias del modelo (por animal, ej. peso fuera de rango) y las
// limitaciones generales del modelo (fijas, LIMITACIONES_MODELO_DMI)
// viajan en la respuesta, no se persisten.
async function crearEstimacionNutricional(req, res) {
  const id_potrero = req.potrero.id_potrero;
  const ganado = await ganadoRepository.getGanadoByPotrero(id_potrero);

  if (ganado.length === 0) {
    return res.status(400).json({ error: 'El potrero no tiene animales con asignación vigente.' });
  }

  let prediccion;
  try {
    prediccion = await predictDmi({ animales: ganado.map(aAnimalDelModelo) });
  } catch (error) {
    if (error instanceof ModeloPredictivoError) {
      return res.status(502).json({ error: error.message });
    }
    throw error;
  }

  const kg_materia_seca_dia = prediccion.predicciones.reduce((total, p) => total + Number(p.dmi_kg_dia || 0), 0);

  const estimacion = await estimacionDemandaRepository.crear({
    id_potrero,
    fecha_calculo: toMysqlDatetimeUtc(new Date()),
    cantidad_animales: ganado.length,
    kg_materia_seca_dia: Number(kg_materia_seca_dia.toFixed(2)),
    version_modelo: VERSION_DMI,
    nivel_confianza: null,
  });

  return res.status(201).json({
    ...estimacion,
    advertencias: prediccion.advertencias ?? [],
    advertencias_generales: LIMITACIONES_MODELO_DMI,
    predicciones: prediccion.predicciones,
  });
}

// #32
async function historicoNutricional(req, res) {
  const historico = await estimacionDemandaRepository.getHistoricoByPotrero(req.potrero.id_potrero, req.query);
  if (historico.length === 0) {
    return res.json({ estimaciones: [], mensaje: 'No hay datos de demanda nutricional en el rango solicitado.' });
  }
  return res.json({ estimaciones: historico });
}

function fechaLocalActual() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function fechaValida(fecha) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const parsed = new Date(`${fecha}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === fecha;
}

function stockPersistible(id_potrero, dmi, resultado) {
  const { potrero, crecimiento, consumo, coherencia, seleccion_referencia: seleccion } = resultado;
  const inicial = resultado.stock_inicial_estimado;
  const final = resultado.stock_final_utilizable;
  return {
    id_potrero,
    id_estimacion_demanda: dmi?.id_estimacion ?? null,
    fecha_inicio: potrero.fecha_inicio,
    fecha_objetivo: potrero.fecha_objetivo,
    fecha_calculo: toMysqlDatetimeUtc(new Date()),
    superficie_ha: potrero.superficie_ha,
    consumo_diario_total_kg_ms: consumo.diario_total_potrero_kg_ms,
    consumo_diario_kg_ms_ha: consumo.diario_kg_ms_ha,
    consumo_acumulado_kg_ms_ha: consumo.acumulado_kg_ms_ha,
    crecimiento_bruto_kg_ms_ha_dia: crecimiento.crecimiento_bruto_promedio_kg_ms_ha_dia.central,
    crecimiento_utilizable_kg_ms_ha_dia: crecimiento.crecimiento_utilizable_promedio_kg_ms_ha_dia.central,
    produccion_utilizable_kg_ms_ha: crecimiento.produccion_utilizable_acumulada_kg_ms_ha.central,
    stock_inicial_min_kg_ms_ha: inicial.valor_kg_ms_ha.min,
    stock_inicial_central_kg_ms_ha: inicial.valor_kg_ms_ha.central,
    stock_inicial_max_kg_ms_ha: inicial.valor_kg_ms_ha.max,
    stock_final_min_kg_ms_ha: final.valor_kg_ms_ha.min,
    stock_final_central_kg_ms_ha: final.valor_kg_ms_ha.central,
    stock_final_max_kg_ms_ha: final.valor_kg_ms_ha.max,
    stock_final_total_kg_ms: final.total_potrero_kg_ms.central,
    ecorregion: resultado.contexto_gis?.ecorregiones?.[0]?.nombre ?? null,
    unidad_vegetacion: resultado.contexto_gis?.unidades_vegetacion?.[0]?.codigo ?? null,
    seleccion_regional_estado: seleccion.estado,
    confianza_geografica: coherencia.confianza_geografica,
    confianza_ambiental: coherencia.confianza_ambiental,
    confianza_satelital: coherencia.confianza_satelital,
    confianza_historica: coherencia.confianza_historica,
    confianza_stock_inicial: inicial.confianza,
    estado: coherencia.estado,
    version_metodologia: resultado.metodologia,
    detalle_json: resultado,
  };
}

async function crearEstimacionStock(req, res) {
  const id_potrero = req.potrero.id_potrero;
  const fecha = req.body?.fecha ?? fechaLocalActual();
  if (!fechaValida(fecha)) return res.status(400).json({ error: 'fecha debe tener formato YYYY-MM-DD y ser válida.' });
  if (fecha > fechaLocalActual()) return res.status(400).json({ error: 'La fecha de Stock no puede ser futura.' });

  return res.status(202).json(iniciarStock(id_potrero, fecha));
}

function iniciarStock(id_potrero, fecha = fechaLocalActual(), refreshDmi = false) {
  return require('../services/stockJobs').start(id_potrero, async () => {
  if (refreshDmi) {
    let status = 200, body;
    await crearEstimacionNutricional({potrero:{id_potrero}}, {status(code){status=code;return this;},json(value){body=value;return this;}});
    if (status >= 400) throw Error(`Ganado guardado; no se pudo actualizar DMI/stock: ${body?.error ?? status}`);
  }
  const [potrero, dmi] = await Promise.all([
    potreroRepository.getPotreroById(id_potrero),
    estimacionDemandaRepository.getUltimaByPotrero(id_potrero),
  ]);
  if (!potrero || !potrero.activo) throw new Error('El potrero no está activo.');
    const [previous, assignments, estimates] = await Promise.all([
      estimacionStockRepository.getUltimaByPotrero(id_potrero),
      require('../database/sql/asignacionGanado.repository').getHistorialByPotrero(id_potrero),
      estimacionDemandaRepository.getHistoricoByPotrero(id_potrero),
    ]);
    const resultado = await require('../services/stockDaily.service').calculateDaily({
      potrero, fecha, previous, assignments, estimates, predict: predictStock,
    });
    const estimacion = await sequelize.transaction(transaction =>
      estimacionStockRepository.crear(stockPersistible(id_potrero, dmi, resultado), transaction)
    );
    return { ...estimacion, demanda_utilizada: dmi };
  }, refreshDmi);
}

function estadoTareaStock(req, res) {
  return res.json(require('../services/stockJobs').get(req.potrero.id_potrero));
}

async function ultimaEstimacionStock(req, res) {
  const estimacion = await estimacionStockRepository.getUltimaByPotrero(req.potrero.id_potrero);
  if (!estimacion) return res.status(404).json({ error: 'Todavía no hay una estimación de Stock para este potrero.' });
  return res.json(estimacion);
}

async function historicoStock(req, res) {
  const estimaciones = await estimacionStockRepository.getHistoricoByPotrero(req.potrero.id_potrero, req.query);
  return res.json({
    estimaciones,
    ...(estimaciones.length === 0 ? { mensaje: 'No hay estimaciones de Stock en el rango solicitado.' } : {}),
  });
}

module.exports = {
  aAnimalDelModelo,
  iniciarStock,
  estadoTareaStock,
  crearEstimacionForrajera,
  historicoForrajera,
  crearEstimacionNutricional,
  historicoNutricional,
  crearEstimacionStock,
  ultimaEstimacionStock,
  historicoStock,
};
