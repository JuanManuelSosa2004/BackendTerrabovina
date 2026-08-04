const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const Recomendacion = sequelize.define(
  'Recomendacion',
  {
    id_recomendacion: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    id_potrero: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    id_estimacion_demanda: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    id_disponibilidad: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    fecha_generacion: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    tipo: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    descripcion: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    prioridad: {
      type: DataTypes.ENUM('1', '2', '3'),
      allowNull: true,
    },
    fundamento: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    estado: {
      type: DataTypes.ENUM('PENDIENTE', 'REALIZADA', 'RECHAZADA'),
      allowNull: false,
      defaultValue: 'PENDIENTE',
    },
  },
  {
    tableName: 'recomendacion',
    timestamps: true,
    underscored: true,
  }
);

module.exports = Recomendacion;
