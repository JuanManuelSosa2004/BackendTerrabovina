'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('estimacion_stock', {
      id_estimacion_stock: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      id_potrero: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'potrero', key: 'id_potrero' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      id_estimacion_demanda: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'estimacion_demanda', key: 'id_estimacion' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      fecha_inicio: { type: Sequelize.DATEONLY, allowNull: false },
      fecha_objetivo: { type: Sequelize.DATEONLY, allowNull: false },
      fecha_calculo: { type: Sequelize.DATE, allowNull: false },
      superficie_ha: { type: Sequelize.DECIMAL(12, 3), allowNull: false },
      consumo_diario_total_kg_ms: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      consumo_diario_kg_ms_ha: { type: Sequelize.DECIMAL(12, 3), allowNull: false },
      consumo_acumulado_kg_ms_ha: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      crecimiento_bruto_kg_ms_ha_dia: { type: Sequelize.DECIMAL(12, 3), allowNull: false },
      crecimiento_utilizable_kg_ms_ha_dia: { type: Sequelize.DECIMAL(12, 3), allowNull: false },
      produccion_utilizable_kg_ms_ha: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      stock_inicial_min_kg_ms_ha: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      stock_inicial_central_kg_ms_ha: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      stock_inicial_max_kg_ms_ha: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      stock_final_min_kg_ms_ha: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      stock_final_central_kg_ms_ha: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      stock_final_max_kg_ms_ha: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      stock_final_total_kg_ms: { type: Sequelize.DECIMAL(16, 2), allowNull: false },
      ecorregion: { type: Sequelize.STRING(120), allowNull: true },
      unidad_vegetacion: { type: Sequelize.STRING(40), allowNull: true },
      seleccion_regional_estado: { type: Sequelize.STRING(40), allowNull: true },
      confianza_geografica: { type: Sequelize.STRING(24), allowNull: true },
      confianza_ambiental: { type: Sequelize.STRING(24), allowNull: true },
      confianza_satelital: { type: Sequelize.STRING(24), allowNull: true },
      confianza_historica: { type: Sequelize.STRING(24), allowNull: true },
      confianza_stock_inicial: { type: Sequelize.STRING(24), allowNull: true },
      estado: { type: Sequelize.STRING(40), allowNull: false },
      version_metodologia: { type: Sequelize.STRING(120), allowNull: false },
      detalle_json: { type: Sequelize.JSON, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('estimacion_stock', ['id_potrero', 'fecha_calculo']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('estimacion_stock');
  },
};
