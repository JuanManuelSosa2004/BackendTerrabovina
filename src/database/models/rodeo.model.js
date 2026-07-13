const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const Rodeo = sequelize.define(
  'Rodeo',
  {
    id_rodeo: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    id_estancia: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    id_potrero_actual: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    nombre: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    descripcion: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    activo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: 'rodeo',
    timestamps: true,
    underscored: true,
  }
);

module.exports = Rodeo;
