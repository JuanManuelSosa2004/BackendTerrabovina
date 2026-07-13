const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const Potrero = sequelize.define(
  'Potrero',
  {
    id_potrero: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    id_estancia: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    nombre: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    descripcion: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    superficie_ha: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    geom: {
      type: DataTypes.GEOMETRY('POLYGON', 4326),
      allowNull: true,
    },
    activo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: 'potrero',
    timestamps: true,
    underscored: true,
  }
);

module.exports = Potrero;
