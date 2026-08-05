'use strict';

const observacionSatelitalRepository = require('../database/sql/observacionSatelital.repository');
const datoClimaticoRepository = require('../database/sql/datoClimatico.repository');

// #26: RNF003 — devuelve la última observación satelital persistida, sin
// importar su antigüedad, en lugar de interrumpir el servicio. La ingesta
// (llamar al modelo predictivo) sólo ocurre en POST
// /potrero/{id}/estimacion-forrajera; un GET nunca dispara una llamada a
// un servicio externo. Si el potrero nunca tuvo una estimación, 404.
async function getNdviVigente(req, res) {
  const observacion = await observacionSatelitalRepository.getUltimaByPotrero(req.potrero.id_potrero);
  if (!observacion) {
    return res.status(404).json({
      error: 'No hay observación satelital todavía. Ejecute POST .../estimacion-forrajera para generar una.',
    });
  }
  return res.json(observacion);
}

// #27
async function getNdviHistorico(req, res) {
  const id_potrero = req.potrero.id_potrero;
  const { desde, hasta } = req.query;
  const observaciones = await observacionSatelitalRepository.getHistorialByPotrero(id_potrero, { desde, hasta });

  if (observaciones.length === 0) {
    return res.json({ observaciones: [], mensaje: 'No hay datos de NDVI en el rango solicitado.' });
  }
  return res.json({ observaciones });
}

// #28: misma lógica que #26 — sólo lectura de lo último persistido.
async function getDatoClimaVigente(req, res) {
  const dato = await datoClimaticoRepository.getUltimoByPotrero(req.potrero.id_potrero);
  if (!dato) {
    return res.status(404).json({
      error: 'No hay dato climático todavía. Ejecute POST .../estimacion-forrajera para generar uno.',
    });
  }
  return res.json(dato);
}

module.exports = { getNdviVigente, getNdviHistorico, getDatoClimaVigente };
