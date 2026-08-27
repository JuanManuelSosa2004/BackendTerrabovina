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
      type: DataTypes.ENUM(
        'MOVER_GANADO',
        'REDUCIR_CARGA',
        'AUMENTAR_CARGA',
        'SUPLEMENTAR',
        'MANTENER',
        'NUEVA_MEDICION'
      ),
      allowNull: false,
    },
    descripcion: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    prioridad: {
      type: DataTypes.ENUM('BAJA', 'MEDIA', 'ALTA'),
      allowNull: true,
    },
    fundamento: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    // Cuatro estados, no tres: ACEPTADA (el productor la aprueba) y APLICADA
    // (efectivamente se ejecutó) son momentos distintos, y separarlos permite
    // vincular una recomendación con el TrasladoGanado que la materializó.
    estado: {
      type: DataTypes.ENUM('PENDIENTE', 'ACEPTADA', 'RECHAZADA', 'APLICADA'),
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
