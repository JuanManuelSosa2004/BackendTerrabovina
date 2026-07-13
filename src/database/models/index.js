const { sequelize } = require('../sequelize');
const Usuario = require('./usuario.model');
const Estancia = require('./estancia.model');
const Potrero = require('./potrero.model');
const ZonaPotrero = require('./zonaPotrero.model');
const Rodeo = require('./rodeo.model');
const Ganado = require('./ganado.model');

Usuario.hasOne(Estancia, { foreignKey: 'id_usuario', as: 'estancia' });
Estancia.belongsTo(Usuario, { foreignKey: 'id_usuario', as: 'usuario' });

Estancia.hasMany(Potrero, { foreignKey: 'id_estancia', as: 'potreros' });
Potrero.belongsTo(Estancia, { foreignKey: 'id_estancia', as: 'estancia' });

Potrero.hasMany(ZonaPotrero, { foreignKey: 'id_potrero', as: 'zonas' });
ZonaPotrero.belongsTo(Potrero, { foreignKey: 'id_potrero', as: 'potrero' });

Estancia.hasMany(Rodeo, { foreignKey: 'id_estancia', as: 'rodeos' });
Rodeo.belongsTo(Estancia, { foreignKey: 'id_estancia', as: 'estancia' });

Potrero.hasMany(Rodeo, { foreignKey: 'id_potrero_actual', as: 'rodeosEnPotrero' });
Rodeo.belongsTo(Potrero, { foreignKey: 'id_potrero_actual', as: 'potreroActual' });

Rodeo.hasMany(Ganado, { foreignKey: 'id_rodeo', as: 'ganado' });
Ganado.belongsTo(Rodeo, { foreignKey: 'id_rodeo', as: 'rodeo' });

module.exports = {
  sequelize,
  Usuario,
  Estancia,
  Potrero,
  ZonaPotrero,
  Rodeo,
  Ganado,
};
