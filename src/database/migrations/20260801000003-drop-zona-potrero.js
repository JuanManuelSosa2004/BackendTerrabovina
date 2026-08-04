'use strict';

/**
 * El DER V2 elimina ZonaPotrero (docs/backend-gap-analysis.md §1). RF018
 * ("definir zonas dentro de un potrero") queda como requisito pendiente de
 * reponer en el documento (§5.9), no en el código: no hay entidad para
 * sostenerlo hasta que se resuelva.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query('ALTER TABLE `zona_potrero` DROP COLUMN `geom`;');
    await queryInterface.dropTable('zona_potrero');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.createTable('zona_potrero', {
      id_zona_potrero: {
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
        onDelete: 'RESTRICT',
      },
      tipo: {
        type: Sequelize.ENUM('PASTO', 'SOMBRA', 'AGUA'),
        allowNull: false,
      },
      preferencia: {
        type: Sequelize.ENUM('ALTA', 'MEDIA', 'BAJA'),
        allowNull: false,
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
      'ALTER TABLE `zona_potrero` ADD COLUMN `geom` POLYGON SRID 4326 NULL AFTER `preferencia`;'
    );
  },
};
