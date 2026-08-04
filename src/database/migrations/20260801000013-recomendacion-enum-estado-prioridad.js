'use strict';

/**
 * Cierra 2 de los 9 ENUM pendientes (docs/backend-gap-analysis.md §2):
 * estado (ciclo de vida de la recomendación: pendiente hasta que el
 * productor la marca como aplicada o la descarta) y prioridad (1 = más
 * urgente, 3 = menos urgente, ver estimaciones.placeholder.js). tipo sigue
 * en VARCHAR(50): su conjunto de valores todavía no está cerrado.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('recomendacion', 'estado', {
      type: Sequelize.ENUM('PENDIENTE', 'REALIZADA', 'RECHAZADA'),
      allowNull: false,
      defaultValue: 'PENDIENTE',
    });
    await queryInterface.changeColumn('recomendacion', 'prioridad', {
      type: Sequelize.ENUM('1', '2', '3'),
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('recomendacion', 'estado', {
      type: Sequelize.STRING(50),
      allowNull: false,
      defaultValue: 'PENDIENTE',
    });
    await queryInterface.changeColumn('recomendacion', 'prioridad', {
      type: Sequelize.STRING(50),
      allowNull: true,
    });
  },
};
