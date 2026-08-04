'use strict';

/**
 * Cierra otro de los 9 ENUM pendientes (docs/backend-gap-analysis.md §2):
 * estado_fisiologico ya tiene un conjunto de valores definido. N = normal
 * (no gestante ni lactante), L = lactando, P = preñada, B = seca/vacía, y
 * las combinaciones P/L, B/L, N/P para los estados simultáneos o de
 * transición. DESCONOCIDO cubre animales sin este dato relevado (el campo
 * sigue siendo nullable para "sin dato" propiamente dicho).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('ganado', 'estado_fisiologico', {
      type: Sequelize.ENUM('N', 'L', 'P', 'B', 'P/L', 'B/L', 'N/P', 'DESCONOCIDO'),
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('ganado', 'estado_fisiologico', {
      type: Sequelize.STRING(50),
      allowNull: true,
    });
  },
};
