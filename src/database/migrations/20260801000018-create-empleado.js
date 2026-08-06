'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('empleado', {
      id_empleado: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      id_estancia: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'estancia',
          key: 'id_estancia',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      nombre: {
        type: Sequelize.STRING(150),
        allowNull: false,
      },
      rol: {
        type: Sequelize.ENUM('PEON', 'CAPATAZ'),
        allowNull: false,
      },
      telefono: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      activo: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('empleado');
  },
};
