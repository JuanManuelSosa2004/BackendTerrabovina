'use strict';

/**
 * Demanda nutricional agregada del ganado asignado a un potrero (§3.8 del
 * PFI). A diferencia del modelo viejo (que la calculaba sobre el rodeo),
 * ahora se calcula por potrero a partir de las asignaciones activas de
 * ganado en ese potrero — coherente con la desaparición de Rodeo y con el
 * endpoint #31 (POST /potrero/{id}/estimacion-nutricional).
 *
 * Entidad de sólo alta, igual que disponibilidad_forrajera.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('estimacion_demanda', {
      id_estimacion: {
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
      fecha_calculo: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      cantidad_animales: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      kg_materia_seca_dia: {
        type: Sequelize.DECIMAL(8, 2),
        allowNull: false,
      },
      version_modelo: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      nivel_confianza: {
        type: Sequelize.DECIMAL(5, 4),
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
    await queryInterface.dropTable('estimacion_demanda');
  },
};
