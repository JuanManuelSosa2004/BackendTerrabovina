'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('estancia', {
      id_estancia: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      id_usuario: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
        references: {
          model: 'usuario',
          key: 'id_usuario',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      nombre: {
        type: Sequelize.STRING(150),
        allowNull: false,
      },
      departamento: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      provincia: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      superficie_total_ha: {
        type: Sequelize.DECIMAL(10, 2),
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

    // DataTypes.GEOMETRY no garantiza el DDL exacto "POLYGON SRID 4326" en
    // MySQL 8 vía createTable; se agrega con SQL explícito para asegurar el
    // subtipo y el SRID reales.
    await queryInterface.sequelize.query(
      'ALTER TABLE `estancia` ADD COLUMN `geom` POLYGON SRID 4326 NULL AFTER `superficie_total_ha`;'
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('ALTER TABLE `estancia` DROP COLUMN `geom`;');
    await queryInterface.dropTable('estancia');
  },
};
