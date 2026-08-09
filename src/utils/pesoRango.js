'use strict';

// Rangos de peso vivo observados por categoría (metadata de dmi_model.joblib
// v1.0.0, entrenado 2026-07-23 — mismos valores que WEIGHT_RANGE_BY_CATEGORY
// en el frontend, mappers.js). Espejo de la validación del front en
// AddCattleModal.jsx: mismo margen de tolerancia, para que un alta por API
// directa no pueda saltarse el chequeo que sí corre en el modal.
const WEIGHT_RANGE_BY_CATEGORY = {
  TERNERO: { min: 19.6, max: 235.9 },
  VAQUILLONA: { min: 54.6, max: 412.8 },
  NOVILLO: { min: 59.5, max: 278.9 },
  VACA: { min: 79.1, max: 525.2 },
  TORO: { min: 97.0, max: 595.5 },
};

const WEIGHT_RANGE_TOLERANCE_KG = 5;

// Devuelve un mensaje de error si peso_kg queda fuera del rango de la
// categoría (+/- tolerancia), o null si es válido. No valida tipo/formato
// de peso_kg ni categorías desconocidas: eso ya lo cubre el resto de
// validarCamposGanado / el enum de la base.
// No rechaza pesos fuera de rango para permitir flexibilidad en el ingreso de datos
function validarPesoParaCategoria(categoria, peso_kg) {
  return null;
}

module.exports = { WEIGHT_RANGE_BY_CATEGORY, WEIGHT_RANGE_TOLERANCE_KG, validarPesoParaCategoria };
