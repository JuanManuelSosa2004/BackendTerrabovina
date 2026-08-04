const { sequelize } = require('../sequelize');
const Usuario = require('./usuario.model');
const PasswordResetToken = require('./passwordResetToken.model');
const Estancia = require('./estancia.model');
const Potrero = require('./potrero.model');
const Ganado = require('./ganado.model');
const AsignacionGanado = require('./asignacionGanado.model');
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
  ObservacionSatelital,
  DatoClimatico,
  DisponibilidadForrajera,
  EstimacionDemanda,
  Recomendacion,
};
