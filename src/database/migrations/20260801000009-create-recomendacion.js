'use strict';

/**
 * Cruza EstimacionDemanda y DisponibilidadForrajera de un mismo potrero
 * para producir una recomendación explicable (RF009-RF011, RNF010). A
 * diferencia de las tablas de estimación, sí tiene updated_at: el
 * productor puede aceptarla, rechazarla o marcarla como aplicada
 * (Recomendacion.estado cambia después del alta).
 *
 * tipo, prioridad y estado quedan en VARCHAR(50): 3 de los 9 ENUM sin
 * conjunto de valores todavía (docs/backend-gap-analysis.md §2). estado
 * arranca en 'PENDIENTE' por default, que es un valor de cadena válido
 * aunque el conjunto completo del ENUM no esté cerrado.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('recomendacion', {
      id_recomendacion: {
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
      id_estimacion_demanda: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'estimacion_demanda',
          key: 'id_estimacion',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      id_disponibilidad: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'disponibilidad_forrajera',
          key: 'id_disponibilidad',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      fecha_generacion: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      tipo: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      descripcion: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      prioridad: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      fundamento: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      estado: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'PENDIENTE',
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
    await queryInterface.dropTable('recomendacion');
  },
};
