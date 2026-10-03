'use strict';

function validarSuperficie(value, field) {
  if (value === undefined || value === null) return null;
  if (!['number', 'string'].includes(typeof value) ||
      (typeof value === 'string' && !value.trim()) ||
      !Number.isFinite(Number(value)) || Number(value) < 0.01 || Number(value) > 99999999.99) {
    return `${field} debe ser un número entre 0.01 y 99999999.99 hectáreas.`;
  }
  return null;
}

module.exports = { validarSuperficie };
