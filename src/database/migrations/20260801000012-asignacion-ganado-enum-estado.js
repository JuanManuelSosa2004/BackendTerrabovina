'use strict';

/**
 * Cierra 1 de los 9 ENUM pendientes (docs/backend-gap-analysis.md §2):
 * asignacion_ganado.estado ya tiene un conjunto de valores definido
 * ('ACTIVA' / 'FINALIZADA'), los mismos literales que ya usan
 * asignacionGanado.controller.js y ganado.controller.js.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('asignacion_ganado', 'estado', {
      type: Sequelize.ENUM('ACTIVA', 'FINALIZADA'),
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('asignacion_ganado', 'estado', {
      type: Sequelize.STRING(50),
      allowNull: false,
    });
  },
};
