'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('potrero', {
      id_potrero: {
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
      descripcion: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      superficie_ha: {
        type: Sequelize.DECIMAL(10, 2),
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

    await queryInterface.sequelize.query(
      'ALTER TABLE `potrero` ADD COLUMN `geom` POLYGON SRID 4326 NULL AFTER `superficie_ha`;'
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('ALTER TABLE `potrero` DROP COLUMN `geom`;');
    await queryInterface.dropTable('potrero');
  },
};
