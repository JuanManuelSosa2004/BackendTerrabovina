const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const ZonaPotrero = sequelize.define(
  'ZonaPotrero',
  {
    id_zona_potrero: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    id_potrero: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    tipo: {
      type: DataTypes.ENUM('PASTO', 'SOMBRA', 'AGUA'),
      allowNull: false,
    },
    preferencia: {
      type: DataTypes.ENUM('ALTA', 'MEDIA', 'BAJA'),
      allowNull: false,
    },
    geom: {
      type: DataTypes.GEOMETRY('POLYGON', 4326),
      allowNull: true,
    },
  },
  {
    tableName: 'zona_potrero',
    timestamps: true,
    underscored: true,
  }
);

module.exports = ZonaPotrero;
