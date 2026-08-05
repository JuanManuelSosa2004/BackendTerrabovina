const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const TrasladoGanado = sequelize.define(
  'TrasladoGanado',
  {
    id_traslado: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    id_estancia: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    id_potrero_origen: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    id_potrero_destino: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    fecha_movimiento: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    observaciones: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    id_usuario: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    tableName: 'traslado_ganado',
    timestamps: true,
    underscored: true,
  }
);

module.exports = TrasladoGanado;
