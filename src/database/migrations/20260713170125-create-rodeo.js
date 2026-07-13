'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('rodeo', {
      id_rodeo: {
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
      id_potrero_actual: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'potrero',
          key: 'id_potrero',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      nombre: {
        type: Sequelize.STRING(150),
        allowNull: false,
      },
      descripcion: {
        type: Sequelize.STRING(500),
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
    await queryInterface.dropTable('rodeo');
  },
};
