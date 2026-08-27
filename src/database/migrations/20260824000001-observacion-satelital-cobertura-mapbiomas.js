'use strict';

/**
 * El modelo predictivo ya devuelve `cobertura_suelo_mapbiomas` en
 * `datos_imagen_satelital` (POST .../estimacion-forrajera), pero
 * estimacion.controller.js lo descartaba: no había columna donde
 * persistirlo. Sin esto no hay forma de asignar automáticamente los
 * parámetros U/X por región (docs/estimacion-biomasa-parada.md §9,
 * docs/ventana-acumulacion-utilizacion-bibliografia.md §5).
 *
 * Nullable porque las observaciones ya persistidas, y cualquier fuente
 * futura que no sea el modelo predictivo, no la tienen.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('observacion_satelital', 'cobertura_suelo_mapbiomas', {
      type: Sequelize.STRING(50),
      allowNull: true,
      after: 'nubosidad',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('observacion_satelital', 'cobertura_suelo_mapbiomas');
  },
};
