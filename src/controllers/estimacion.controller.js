'use strict';

const potreroRepository = require('../database/sql/potrero.repository');
const ganadoRepository = require('../database/sql/ganado.repository');
const observacionSatelitalRepository = require('../database/sql/observacionSatelital.repository');
const datoClimaticoRepository = require('../database/sql/datoClimatico.repository');
const disponibilidadForrajeraRepository = require('../database/sql/disponibilidadForrajera.repository');
const estimacionDemandaRepository = require('../database/sql/estimacionDemanda.repository');
const {
  generarObservacionSatelitalPlaceholder,
  generarDatoClimaticoPlaceholder,
} = require('../services/fuentesExternas.placeholder');
const { calcularDisponibilidadForrajera, calcularDemandaGanado } = require('../services/estimaciones.placeholder');

function hoy() {
  return new Date().toISOString().slice(0, 10);
}

// #29: RF003/RF004 — traduce la observación satelital y climática
// vigentes en disponibilidad forrajera. Ver services/estimaciones.placeholder.js.
async function crearEstimacionForrajera(req, res) {
  const id_potrero = req.potrero.id_potrero;
  const potrero = await potreroRepository.getPotreroById(id_potrero);

  let observacion = await observacionSatelitalRepository.getUltimaByPotrero(id_potrero);
  if (!observacion) {
    observacion = await observacionSatelitalRepository.crearObservacion({
      id_potrero,
      ...generarObservacionSatelitalPlaceholder(hoy()),
    });
  }
  let clima = await datoClimaticoRepository.getUltimoByPotrero(id_potrero);
  if (!clima) {
    clima = await datoClimaticoRepository.crearDato({ id_potrero, ...generarDatoClimaticoPlaceholder(hoy()) });
  }

  const calculo = calcularDisponibilidadForrajera({ ndvi: observacion.ndvi, precipitacion: clima.precipitacion });
  const disponibilidad = await disponibilidadForrajeraRepository.crear({
    id_potrero,
    fecha_calculo: new Date(),
    superficie_analizada_ha: potrero.superficie_ha,
    indice_ndvi: observacion.ndvi,
    ...calculo,
  });

  return res.status(201).json(disponibilidad);
}

// #30
async function historicoForrajera(req, res) {
  const historico = await disponibilidadForrajeraRepository.getHistoricoByPotrero(req.potrero.id_potrero, req.query);
  if (historico.length === 0) {
    return res.json({ disponibilidad: [], mensaje: 'No hay datos de disponibilidad forrajera en el rango solicitado.' });
  }
  return res.json({ disponibilidad: historico });
}

// #31: RF008 — demanda nutricional agregada del ganado actualmente
// asignado al potrero (no del rodeo: esa entidad desapareció del DER).
async function crearEstimacionNutricional(req, res) {
  const id_potrero = req.potrero.id_potrero;
  const ganado = await ganadoRepository.getGanadoByPotrero(id_potrero);

  const calculo = calcularDemandaGanado(ganado);
  const estimacion = await estimacionDemandaRepository.crear({
    id_potrero,
    fecha_calculo: new Date(),
    ...calculo,
  });

  return res.status(201).json(estimacion);
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
