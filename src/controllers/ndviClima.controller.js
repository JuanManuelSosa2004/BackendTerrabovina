'use strict';

const observacionSatelitalRepository = require('../database/sql/observacionSatelital.repository');
const datoClimaticoRepository = require('../database/sql/datoClimatico.repository');
const {
  generarObservacionSatelitalPlaceholder,
  generarDatoClimaticoPlaceholder,
} = require('../services/fuentesExternas.placeholder');

function hoy() {
  return new Date().toISOString().slice(0, 10);
}

// #26: RNF003 — si hay una observación (aunque tenga varios días), se
// devuelve tal cual con su fecha en lugar de fallar; sólo se genera una
// nueva si el potrero no tiene ninguna todavía (bootstrap). No repite el
// cálculo en cada GET para no romper idempotencia
// (docs/backend-gap-analysis.md §5.8).
async function getNdviVigente(req, res) {
  const id_potrero = req.potrero.id_potrero;
  let observacion = await observacionSatelitalRepository.getUltimaByPotrero(id_potrero);

  if (!observacion) {
    observacion = await observacionSatelitalRepository.crearObservacion({
      id_potrero,
      ...generarObservacionSatelitalPlaceholder(hoy()),
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

// #28
async function getDatoClimaVigente(req, res) {
  const id_potrero = req.potrero.id_potrero;
  let dato = await datoClimaticoRepository.getUltimoByPotrero(id_potrero);

  if (!dato) {
    dato = await datoClimaticoRepository.crearDato({ id_potrero, ...generarDatoClimaticoPlaceholder(hoy()) });
  }

  return res.json(dato);
}

module.exports = { getNdviVigente, getNdviHistorico, getDatoClimaVigente };
