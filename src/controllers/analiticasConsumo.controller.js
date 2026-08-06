'use strict';

const analiticasConsumoRepository = require('../database/sql/analiticasConsumo.repository');

// requireEstanciaOwnership ya validó pertenencia de la estancia.
async function analiticas(req, res) {
  const resultado = await analiticasConsumoRepository.getAnaliticasConsumo(req.estancia.id_estancia);
  return res.json(resultado);
}

module.exports = { analiticas };
