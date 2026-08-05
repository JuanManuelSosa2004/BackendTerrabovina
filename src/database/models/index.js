const { sequelize } = require('../sequelize');
const Usuario = require('./usuario.model');
const PasswordResetToken = require('./passwordResetToken.model');
const Estancia = require('./estancia.model');
const Potrero = require('./potrero.model');
const Ganado = require('./ganado.model');
const AsignacionGanado = require('./asignacionGanado.model');
const TrasladoGanado = require('./trasladoGanado.model');
const TrasladoGanadoDetalle = require('./trasladoGanadoDetalle.model');
const ObservacionSatelital = require('./observacionSatelital.model');
const DatoClimatico = require('./datoClimatico.model');
const DisponibilidadForrajera = require('./disponibilidadForrajera.model');
const EstimacionDemanda = require('./estimacionDemanda.model');
const Recomendacion = require('./recomendacion.model');

Usuario.hasOne(Estancia, { foreignKey: 'id_usuario', as: 'estancia' });
Estancia.belongsTo(Usuario, { foreignKey: 'id_usuario', as: 'usuario' });

Usuario.hasMany(PasswordResetToken, { foreignKey: 'id_usuario', as: 'tokensRecuperacion' });
PasswordResetToken.belongsTo(Usuario, { foreignKey: 'id_usuario', as: 'usuario' });

Estancia.hasMany(Potrero, { foreignKey: 'id_estancia', as: 'potreros' });
Potrero.belongsTo(Estancia, { foreignKey: 'id_estancia', as: 'estancia' });

// El ganado cuelga directamente de la estancia (ya no de un rodeo, que
// desapareció del DER V2). Su ubicación en un potrero, si la tiene, se
// resuelve a través de AsignacionGanado.
Estancia.hasMany(Ganado, { foreignKey: 'id_estancia', as: 'ganado' });
Ganado.belongsTo(Estancia, { foreignKey: 'id_estancia', as: 'estancia' });

Ganado.hasMany(AsignacionGanado, { foreignKey: 'id_ganado', as: 'asignaciones' });
AsignacionGanado.belongsTo(Ganado, { foreignKey: 'id_ganado', as: 'ganado' });

Potrero.hasMany(AsignacionGanado, { foreignKey: 'id_potrero', as: 'asignaciones' });
AsignacionGanado.belongsTo(Potrero, { foreignKey: 'id_potrero', as: 'potrero' });

// Cabecera del traslado: cuelga de la estancia y referencia dos potreros
// de esa misma estancia (origen y destino). Cada uno necesita su propio
// alias porque Sequelize no puede inferirlos a partir de una sola FK
// genérica "id_potrero".
Estancia.hasMany(TrasladoGanado, { foreignKey: 'id_estancia', as: 'trasladosGanado' });
TrasladoGanado.belongsTo(Estancia, { foreignKey: 'id_estancia', as: 'estancia' });
Potrero.hasMany(TrasladoGanado, { foreignKey: 'id_potrero_origen', as: 'trasladosComoOrigen' });
TrasladoGanado.belongsTo(Potrero, { foreignKey: 'id_potrero_origen', as: 'potreroOrigen' });
Potrero.hasMany(TrasladoGanado, { foreignKey: 'id_potrero_destino', as: 'trasladosComoDestino' });
TrasladoGanado.belongsTo(Potrero, { foreignKey: 'id_potrero_destino', as: 'potreroDestino' });
Usuario.hasMany(TrasladoGanado, { foreignKey: 'id_usuario', as: 'trasladosGanado' });
TrasladoGanado.belongsTo(Usuario, { foreignKey: 'id_usuario', as: 'usuario' });

// Detalle: un renglón por animal trasladado, con las dos asignaciones
// (origen/destino) que ese traslado abrió y cerró en asignacion_ganado.
TrasladoGanado.hasMany(TrasladoGanadoDetalle, { foreignKey: 'id_traslado', as: 'detalles' });
TrasladoGanadoDetalle.belongsTo(TrasladoGanado, { foreignKey: 'id_traslado', as: 'traslado' });
Ganado.hasMany(TrasladoGanadoDetalle, { foreignKey: 'id_ganado', as: 'trasladosDetalle' });
TrasladoGanadoDetalle.belongsTo(Ganado, { foreignKey: 'id_ganado', as: 'ganado' });
AsignacionGanado.hasOne(TrasladoGanadoDetalle, { foreignKey: 'id_asignacion_origen', as: 'detalleComoOrigen' });
TrasladoGanadoDetalle.belongsTo(AsignacionGanado, { foreignKey: 'id_asignacion_origen', as: 'asignacionOrigen' });
AsignacionGanado.hasOne(TrasladoGanadoDetalle, { foreignKey: 'id_asignacion_destino', as: 'detalleComoDestino' });
TrasladoGanadoDetalle.belongsTo(AsignacionGanado, { foreignKey: 'id_asignacion_destino', as: 'asignacionDestino' });

Potrero.hasMany(ObservacionSatelital, { foreignKey: 'id_potrero', as: 'observacionesSatelitales' });
ObservacionSatelital.belongsTo(Potrero, { foreignKey: 'id_potrero', as: 'potrero' });

Potrero.hasMany(DatoClimatico, { foreignKey: 'id_potrero', as: 'datosClimaticos' });
DatoClimatico.belongsTo(Potrero, { foreignKey: 'id_potrero', as: 'potrero' });

Potrero.hasMany(DisponibilidadForrajera, { foreignKey: 'id_potrero', as: 'disponibilidades' });
DisponibilidadForrajera.belongsTo(Potrero, { foreignKey: 'id_potrero', as: 'potrero' });

Potrero.hasMany(EstimacionDemanda, { foreignKey: 'id_potrero', as: 'estimacionesDemanda' });
EstimacionDemanda.belongsTo(Potrero, { foreignKey: 'id_potrero', as: 'potrero' });

Potrero.hasMany(Recomendacion, { foreignKey: 'id_potrero', as: 'recomendaciones' });
Recomendacion.belongsTo(Potrero, { foreignKey: 'id_potrero', as: 'potrero' });

EstimacionDemanda.hasMany(Recomendacion, { foreignKey: 'id_estimacion_demanda', as: 'recomendaciones' });
Recomendacion.belongsTo(EstimacionDemanda, { foreignKey: 'id_estimacion_demanda', as: 'estimacionDemanda' });

DisponibilidadForrajera.hasMany(Recomendacion, { foreignKey: 'id_disponibilidad', as: 'recomendaciones' });
Recomendacion.belongsTo(DisponibilidadForrajera, { foreignKey: 'id_disponibilidad', as: 'disponibilidad' });

module.exports = {
  sequelize,
  Usuario,
  PasswordResetToken,
  Estancia,
  Potrero,
  Ganado,
  AsignacionGanado,
  TrasladoGanado,
  TrasladoGanadoDetalle,
  ObservacionSatelital,
  DatoClimatico,
  DisponibilidadForrajera,
  EstimacionDemanda,
  Recomendacion,
};
