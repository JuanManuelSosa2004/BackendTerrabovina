'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const EstimacionStock = sequelize.define('EstimacionStock', {
  id_estimacion_stock: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  id_potrero: { type: DataTypes.INTEGER, allowNull: false },
  id_estimacion_demanda: { type: DataTypes.INTEGER, allowNull: true },
  fecha_inicio: { type: DataTypes.DATEONLY, allowNull: false },
  fecha_objetivo: { type: DataTypes.DATEONLY, allowNull: false },
  fecha_calculo: { type: DataTypes.DATE, allowNull: false },
  superficie_ha: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
  consumo_diario_total_kg_ms: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  consumo_diario_kg_ms_ha: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
  consumo_acumulado_kg_ms_ha: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  crecimiento_bruto_kg_ms_ha_dia: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
  crecimiento_utilizable_kg_ms_ha_dia: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
  produccion_utilizable_kg_ms_ha: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  stock_inicial_min_kg_ms_ha: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  stock_inicial_central_kg_ms_ha: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  stock_inicial_max_kg_ms_ha: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  stock_final_min_kg_ms_ha: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  stock_final_central_kg_ms_ha: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  stock_final_max_kg_ms_ha: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  stock_final_total_kg_ms: { type: DataTypes.DECIMAL(16, 2), allowNull: false },
  ecorregion: DataTypes.STRING(120),
  unidad_vegetacion: DataTypes.STRING(40),
  seleccion_regional_estado: DataTypes.STRING(40),
  confianza_geografica: DataTypes.STRING(24),
  confianza_ambiental: DataTypes.STRING(24),
  confianza_satelital: DataTypes.STRING(24),
  confianza_historica: DataTypes.STRING(24),
  confianza_stock_inicial: DataTypes.STRING(24),
  estado: { type: DataTypes.STRING(40), allowNull: false },
  version_metodologia: { type: DataTypes.STRING(120), allowNull: false },
  detalle_json: { type: DataTypes.JSON, allowNull: false },
}, {
  tableName: 'estimacion_stock',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
});

module.exports = EstimacionStock;
