'use strict';

/**
 * Igual que observacion_satelital: se agrega id_potrero, ausente en el DER,
 * porque el endpoint #28 (dato-clima) es por potrero
 * (docs/backend-gap-analysis.md §5.2).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('dato_climatico', {
      id_dato: {
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
      fuente: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      fecha: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      temperatura: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: true,
      },
      precipitacion: {
        type: Sequelize.DECIMAL(6, 2),
        allowNull: true,
      },
      humedad: {
        type: Sequelize.DECIMAL(5, 2),
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
    await queryInterface.dropTable('dato_climatico');
  },
};
