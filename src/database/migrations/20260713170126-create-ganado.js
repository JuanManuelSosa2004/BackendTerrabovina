'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('ganado', {
      id_ganado: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      id_rodeo: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'rodeo',
          key: 'id_rodeo',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      numero_identificacion: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true,
      },
      fecha_nacimiento: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      sexo: {
        type: Sequelize.ENUM('M', 'F'),
        allowNull: false,
      },
      categoria: {
        type: Sequelize.ENUM('TERNERO', 'VAQUILLONA', 'NOVILLO', 'VACA', 'TORO'),
        allowNull: false,
      },
      peso_kg: {
        type: Sequelize.DECIMAL(6, 2),
        allowNull: true,
      },
      estado: {
        type: Sequelize.ENUM('ACTIVO', 'VENDIDO', 'MUERTO'),
        allowNull: false,
        defaultValue: 'ACTIVO',
      },
      observaciones: {
        type: Sequelize.STRING(500),
        allowNull: true,
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
    await queryInterface.dropTable('ganado');
  },
};
