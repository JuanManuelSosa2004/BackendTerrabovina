const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const Ganado = sequelize.define(
  'Ganado',
  {
    id_ganado: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    id_rodeo: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    numero_identificacion: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
    fecha_nacimiento: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    sexo: {
      type: DataTypes.ENUM('M', 'F'),
      allowNull: false,
    },
    categoria: {
      type: DataTypes.ENUM('TERNERO', 'VAQUILLONA', 'NOVILLO', 'VACA', 'TORO'),
      allowNull: false,
    },
    peso_kg: {
      type: DataTypes.DECIMAL(6, 2),
      allowNull: true,
    },
    estado: {
      type: DataTypes.ENUM('ACTIVO', 'VENDIDO', 'MUERTO'),
      allowNull: false,
      defaultValue: 'ACTIVO',
    },
    observaciones: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
  },
  {
    tableName: 'ganado',
    timestamps: true,
    underscored: true,
  }
);

module.exports = Ganado;
