const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const ObservacionSatelital = sequelize.define(
  'ObservacionSatelital',
  {
    id_observacion: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    // Ausente en el DER original; agregada por docs/backend-gap-analysis.md
    // §5.2 para que GET /potrero/{id}/ndvi tenga por dónde resolverse.
    id_potrero: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    fuente: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    fecha: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    ndvi: {
      type: DataTypes.DECIMAL(6, 4),
      allowNull: true,
    },
    nubosidad: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
    },
  },
  {
    tableName: 'observacion_satelital',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    underscored: true,
  }
);

module.exports = ObservacionSatelital;
