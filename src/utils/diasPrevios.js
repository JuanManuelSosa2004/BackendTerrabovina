'use strict';
function fechaIngreso(dias = 0, now = new Date()) {
  if (typeof dias !== 'number' || !Number.isInteger(dias) || dias < 0 || dias > 36500) throw Error('dias_previos_potrero debe ser un entero entre 0 y 36500.');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone:'America/Argentina/Buenos_Aires', year:'numeric', month:'2-digit', day:'2-digit' }).format(now);
  return new Date(Date.parse(today+'T00:00:00-03:00')-dias*86400000).toISOString().slice(0,10);
}
module.exports = { fechaIngreso };
