'use strict';

/**
 * Detalle de traslado_ganado: un renglón por cada animal que integró el
 * lote trasladado, enlazando la asignación que se cerró en el potrero
 * origen con la que se abrió en el potrero destino (las mismas filas que
 * ya produce asignacionGanado.repository.js al mover un animal). PK
 * compuesta (id_traslado, id_ganado): un animal aparece a lo sumo una vez
 * por traslado.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('traslado_ganado_detalle', {
      id_traslado: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
        references: {
          model: 'traslado_ganado',
          key: 'id_traslado',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      id_ganado: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
        references: {
          model: 'ganado',
          key: 'id_ganado',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      id_asignacion_origen: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'asignacion_ganado',
          key: 'id_asignacion',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      id_asignacion_destino: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'asignacion_ganado',
          key: 'id_asignacion',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('traslado_ganado_detalle');
  },
};
