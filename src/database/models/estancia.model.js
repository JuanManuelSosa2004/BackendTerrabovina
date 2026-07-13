const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const Estancia = sequelize.define(
  'Estancia',
  {
    id_estancia: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    id_usuario: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
    },
    nombre: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    departamento: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    provincia: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    superficie_total_ha: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    geom: {
      type: DataTypes.GEOMETRY('POLYGON', 4326),
      allowNull: true,
    },
  },
  {
    tableName: 'estancia',
    timestamps: true,
    underscored: true,
  }
);

module.exports = Estancia;
