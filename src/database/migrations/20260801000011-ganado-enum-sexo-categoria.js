'use strict';

/**
 * Cierra 2 de los 9 ENUM pendientes señalados en docs/backend-gap-analysis.md
 * §2: sexo y categoria ya tienen un conjunto de valores definido, así que
 * dejan de ser VARCHAR(50) libre. estado_fisiologico sigue abierto.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('ganado', 'sexo', {
      type: Sequelize.ENUM('M', 'F'),
      allowNull: false,
    });
    await queryInterface.changeColumn('ganado', 'categoria', {
      type: Sequelize.ENUM('TERNERO', 'VAQUILLONA', 'NOVILLO', 'VACA', 'TORO'),
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('ganado', 'sexo', {
      type: Sequelize.STRING(50),
      allowNull: false,
    });
    await queryInterface.changeColumn('ganado', 'categoria', {
      type: Sequelize.STRING(50),
      allowNull: false,
    });
  },
};
