const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const Empleado = sequelize.define(
  'Empleado',
  {
    id_empleado: {
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
    rol: {
      type: DataTypes.ENUM('PEON', 'CAPATAZ'),
      allowNull: false,
    },
    telefono: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    activo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: 'empleado',
    timestamps: true,
    underscored: true,
  }
);

module.exports = Empleado;
