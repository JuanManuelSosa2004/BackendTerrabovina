'use strict';

const potreroRepository = require('../database/sql/potrero.repository');
const ganadoRepository = require('../database/sql/ganado.repository');
const observacionSatelitalRepository = require('../database/sql/observacionSatelital.repository');
const datoClimaticoRepository = require('../database/sql/datoClimatico.repository');
const disponibilidadForrajeraRepository = require('../database/sql/disponibilidadForrajera.repository');
const estimacionDemandaRepository = require('../database/sql/estimacionDemanda.repository');
const { sequelize } = require('../database/sequelize');
const { toMysqlDatetimeUtc } = require('../utils/mysqlDate');
const { predictDmp, predictDmi, ModeloPredictivoError } = require('../services/modeloPredictivo.client');

const VERSION_DMP = 'dmp-model';
const VERSION_DMI = 'dmi-model';

const CATEGORIA_A_MODELO = {
  TERNERO: 'Ternero',
  VAQUILLONA: 'Vaquillona',
  NOVILLO: 'Novillo',
  VACA: 'Vaca',
  TORO: 'Toro',
};

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
// advertencias del modelo viajan en la respuesta, no se persisten.
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

module.exports = { crearEstimacionForrajera, historicoForrajera, crearEstimacionNutricional, historicoNutricional };
