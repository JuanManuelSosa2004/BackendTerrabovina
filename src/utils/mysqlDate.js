'use strict';

// mysql2 escapea un objeto Date usado como replacement con la zona
// horaria LOCAL del proceso, no con la `timezone: '+00:00'` configurada
// en database/sequelize.js (esa opción sólo fija la variable de sesión
// `time_zone`, irrelevante para una columna DATE/DATETIME naive). Se
// formatea a mano acá antes de mandarlo como replacement — mismo motivo
// por el que fecha_desde/fecha_hasta de asignacion_ganado siempre viajan
// como string 'YYYY-MM-DD' y nunca como Date.
function toMysqlDatetimeUtc(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

module.exports = { toMysqlDatetimeUtc };
