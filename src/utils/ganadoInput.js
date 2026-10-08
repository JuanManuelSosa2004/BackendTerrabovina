'use strict';
const { validDate, today } = require('../rotation/rules');
const categories = new Set(['TERNERO', 'VAQUILLONA', 'NOVILLO', 'VACA', 'TORO']);
const states = new Set(['N', 'L', 'P', 'B', 'P/L', 'B/L', 'N/P', 'DESCONOCIDO']);

function validarDatosGanado(body, currentDate = today()) {
  if (!categories.has(body.categoria)) return 'categoria no es una categoría de ganado válida.';
  if (!['M', 'F'].includes(body.sexo)) return 'sexo debe ser M o F.';
  if(body.condicion_corporal!=null&&(!['number','string'].includes(typeof body.condicion_corporal)||String(body.condicion_corporal).trim()===''||!Number.isFinite(Number(body.condicion_corporal))||Number(body.condicion_corporal)<1||Number(body.condicion_corporal)>5))return 'La condición corporal debe estar entre 1 y 5.';
  if (body.estado_fisiologico != null && !states.has(body.estado_fisiologico)) {
    return 'estado_fisiologico no es válido.';
  }
  if (body.fecha_nacimiento != null && (!validDate(body.fecha_nacimiento) ||
      body.fecha_nacimiento < '1000-01-01' || body.fecha_nacimiento > currentDate)) {
    return 'fecha_nacimiento debe ser una fecha válida, no posterior a hoy.';
  }
  return null;
}
module.exports = { validarDatosGanado };
