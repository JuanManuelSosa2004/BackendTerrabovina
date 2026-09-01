'use strict';

const potreroRepository = require('../database/sql/potrero.repository');
const disponibilidadForrajeraRepository = require('../database/sql/disponibilidadForrajera.repository');
const estimacionDemandaRepository = require('../database/sql/estimacionDemanda.repository');
const recomendacionRepository = require('../database/sql/recomendacion.repository');
const { generarRecomendacion } = require('../services/recomendacion.service');

// #34: cruza la última estimación de demanda y de disponibilidad
// vigentes del potrero (RF009, RF010). Ambas deben existir: generarlas es
// responsabilidad de #29 y #31, no de este endpoint.
async function crear(req, res) {
  const id_potrero = req.potrero.id_potrero;
  const [disponibilidad, estimacion, potrero] = await Promise.all([
    disponibilidadForrajeraRepository.getUltimaByPotrero(id_potrero),
    estimacionDemandaRepository.getUltimaByPotrero(id_potrero),
    potreroRepository.getPotreroById(id_potrero),
  ]);

  if (!disponibilidad || !estimacion) {
    return res.status(400).json({
      error:
        'Faltan estimaciones previas para generar una recomendación. ' +
        'Genere primero la disponibilidad forrajera (#29) y la demanda nutricional (#31) del potrero.',
    });
  }

  // La última recomendación del potrero alimenta la histéresis de la banda
  // neutra: sin ella, un potrero con el índice oscilando alrededor de 1
  // alternaría entre "retirar los animales" y "está en recuperación" en
  // evaluaciones consecutivas.
  const [anterior] = await recomendacionRepository.getRecomendacionesByPotrero(id_potrero, {});

  const { tipo, prioridad, descripcion, fundamento } = await generarRecomendacion({
    disponibilidad,
    estimacion,
    potrero,
    tipoAnterior: anterior ? anterior.tipo : null,
  });

  const recomendacion = await recomendacionRepository.crearRecomendacion({
    id_potrero,
    id_estimacion_demanda: estimacion.id_estimacion,
    id_disponibilidad: disponibilidad.id_disponibilidad,
    fecha_generacion: new Date(),
    tipo,
    descripcion,
    prioridad,
    fundamento,
  });

  return res.status(201).json(recomendacion);
}

// #35: filtros por estado, vigencia (pendiente) o rango de fechas.
async function listar(req, res) {
  const { estado, vigente, desde, hasta } = req.query;
  const recomendaciones = await recomendacionRepository.getRecomendacionesByPotrero(req.potrero.id_potrero, {
    estado,
    vigente: vigente === 'true',
    desde,
    hasta,
  });
  return res.json(recomendaciones);
}

module.exports = { crear, listar };
