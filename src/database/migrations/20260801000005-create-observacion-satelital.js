'use strict';

/**
 * El DER (TerraBovina_50_V2.pdf §3.5.1) no le da FK a Potrero, pero los
 * endpoints de NDVI (#26, #27) son todos por potrero: sin esa columna no
 * hay por dónde resolverlos (docs/backend-gap-analysis.md §5.2). Se agrega
 * id_potrero para cerrar ese hueco.
 *
 * Entidad de sólo alta (no tiene updated_at): es un hecho observado, no un
 * recurso que se edite.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('observacion_satelital', {
      id_observacion: {
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
        onDelete: 'CASCADE',
      },
      fuente: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      fecha: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      ndvi: {
        type: Sequelize.DECIMAL(6, 4),
        allowNull: true,
      },
      nubosidad: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('observacion_satelital');
  },
};
