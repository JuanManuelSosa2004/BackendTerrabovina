'use strict';

/**
 * Renombra `cobertura_suelo_mapbiomas` a `clase_cobertura_mapbiomas`.
 *
 * La migración 20260824000001 creó la columna con un nombre que no existe en
 * la respuesta del modelo predictivo: el servicio Flask la envía como
 * `clase_cobertura_mapbiomas`, dentro del vector de features y no dentro de
 * datos_imagen_satelital.
 *
 * La consecuencia era silenciosa. El backend leía una propiedad inexistente,
 * obtenía undefined, y persistía NULL en todas las filas. Como perfilPara cae
 * al perfil por defecto cuando no reconoce la cobertura, todo potrero terminaba
 * usando los parámetros del pastizal natural —factor de utilización 0,50 y sus
 * ventanas de acumulación— con independencia de lo que hubiera en el suelo.
 *
 * Se adopta el nombre del modelo en lugar de traducirlo: la columna guarda
 * exactamente lo que la fuente entrega, y cualquier cambio futuro en el
 * contrato queda visible en un solo lugar.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.renameColumn(
      'observacion_satelital',
      'cobertura_suelo_mapbiomas',
      'clase_cobertura_mapbiomas'
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.renameColumn(
      'observacion_satelital',
      'clase_cobertura_mapbiomas',
      'cobertura_suelo_mapbiomas'
    );
  },
};
