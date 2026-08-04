const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const AsignacionGanado = sequelize.define(
  'AsignacionGanado',
  {
    id_asignacion: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    id_ganado: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    id_potrero: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    fecha_desde: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    // NULL = asignación vigente. La unicidad de "una sola asignación
    // activa por animal" se aplica en la base (columna generada +
    // índice único, ver migración 20260801000004).
    fecha_hasta: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    estado: {
      type: DataTypes.ENUM('ACTIVA', 'FINALIZADA'),
      allowNull: false,
    },
  },
  {
    tableName: 'asignacion_ganado',
    timestamps: true,
    underscored: true,
  }
);

module.exports = AsignacionGanado;
