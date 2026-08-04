const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const Ganado = sequelize.define(
  'Ganado',
  {
    id_ganado: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    id_estancia: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    numero_identificacion: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
    fecha_nacimiento: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    sexo: {
      type: DataTypes.ENUM('M', 'F'),
      allowNull: false,
    },
    categoria: {
      type: DataTypes.ENUM('TERNERO', 'VAQUILLONA', 'NOVILLO', 'VACA', 'TORO'),
      allowNull: false,
    },
    peso_kg: {
      type: DataTypes.DECIMAL(6, 2),
      allowNull: true,
    },
    // Obligatoria a nivel de aplicación sólo para categoria === 'VACA'
    // (única categoría con relevamiento sistemático de esta variable en el
    // modelo de estimación de demanda, PFI §3.7.4). Ver validación en
    // ganado.controller.js.
    condicion_corporal: {
      type: DataTypes.DECIMAL(3, 1),
      allowNull: true,
    },
    estado_fisiologico: {
      type: DataTypes.ENUM('N', 'L', 'P', 'B', 'P/L', 'B/L', 'N/P', 'DESCONOCIDO'),
      allowNull: true,
    },
    observaciones: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    activo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: 'ganado',
    timestamps: true,
    underscored: true,
  }
);

module.exports = Ganado;
