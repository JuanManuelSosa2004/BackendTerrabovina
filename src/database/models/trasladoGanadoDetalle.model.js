const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const TrasladoGanadoDetalle = sequelize.define(
  'TrasladoGanadoDetalle',
  {
    id_traslado: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      allowNull: false,
    },
    id_ganado: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      allowNull: false,
    },
    id_asignacion_origen: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    id_asignacion_destino: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    tableName: 'traslado_ganado_detalle',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    underscored: true,
  }
);

module.exports = TrasladoGanadoDetalle;
