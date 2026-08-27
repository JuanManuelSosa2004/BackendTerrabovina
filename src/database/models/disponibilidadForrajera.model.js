const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const DisponibilidadForrajera = sequelize.define(
  'DisponibilidadForrajera',
  {
    id_disponibilidad: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    id_potrero: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    // Observación satelital que originó este cálculo (misma transacción de
    // estimacionForrajera.service.js#generarEstimacionForrajera). Nullable
    // por las filas ya persistidas antes de esta columna (migración
    // 20260824000002); da la fecha de CAPTURA real, distinta de
    // fecha_calculo, que balanceForrajero.service.js necesita para integrar.
    id_observacion: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    fecha_calculo: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    kg_materia_seca_ha: {
      type: DataTypes.DECIMAL(8, 2),
      allowNull: false,
    },
    superficie_analizada_ha: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    indice_ndvi: {
      type: DataTypes.DECIMAL(6, 4),
      allowNull: true,
    },
    version_modelo: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    nivel_confianza: {
      type: DataTypes.DECIMAL(5, 4),
      allowNull: true,
    },
  },
  {
    tableName: 'disponibilidad_forrajera',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    underscored: true,
  }
);

module.exports = DisponibilidadForrajera;
