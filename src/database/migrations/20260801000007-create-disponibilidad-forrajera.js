'use strict';

/**
 * Estimación de oferta forrajera por potrero (§3.9-3.10 del PFI). Se
 * vincula a ObservacionSatelital y DatoClimatico por derivación de
 * cálculo, no por FK (así lo marca el DER), por lo que esta tabla no
 * referencia a esas dos directamente.
 *
 * Entidad de sólo alta: cada cálculo queda como un registro histórico
 * propio, nunca se edita (RNF010, trazabilidad).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('disponibilidad_forrajera', {
      id_disponibilidad: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      id_potrero: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'potrero',
          key: 'id_potrero',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      fecha_calculo: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      kg_materia_seca_ha: {
        type: Sequelize.DECIMAL(8, 2),
        allowNull: false,
      },
      superficie_analizada_ha: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
      },
      indice_ndvi: {
        type: Sequelize.DECIMAL(6, 4),
        allowNull: true,
      },
      version_modelo: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      nivel_confianza: {
        type: Sequelize.DECIMAL(5, 4),
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('disponibilidad_forrajera');
  },
};
