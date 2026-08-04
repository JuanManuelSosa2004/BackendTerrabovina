const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const DatoClimatico = sequelize.define(
  'DatoClimatico',
  {
    id_dato: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    // Ausente en el DER original; agregada por docs/backend-gap-analysis.md
    // §5.2 para que GET /potrero/{id}/dato-clima tenga por dónde resolverse.
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
    temperatura: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
    },
    precipitacion: {
      type: DataTypes.DECIMAL(6, 2),
      allowNull: true,
    },
    humedad: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
    },
  },
  {
    tableName: 'dato_climatico',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    underscored: true,
  }
);

module.exports = DatoClimatico;
