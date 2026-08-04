const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const EstimacionDemanda = sequelize.define(
  'EstimacionDemanda',
  {
    id_estimacion: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    id_potrero: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    fecha_calculo: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    cantidad_animales: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    kg_materia_seca_dia: {
      type: DataTypes.DECIMAL(8, 2),
      allowNull: false,
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
    tableName: 'estimacion_demanda',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    underscored: true,
  }
);

module.exports = EstimacionDemanda;
