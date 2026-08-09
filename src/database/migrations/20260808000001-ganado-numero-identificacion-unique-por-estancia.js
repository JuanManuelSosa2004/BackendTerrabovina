'use strict';

/**
 * numero_identificacion era único en toda la tabla `ganado` (migración
 * 20260801000001), no por estancia: dos estancias sin relación entre sí
 * (usuarios distintos) podían chocar con un 409 falso si generaban el
 * mismo número de caravana (p. ej. mismas iniciales de potrero), porque el
 * índice único no distinguía de qué estancia era cada animal.
 *
 * Se reemplaza el índice único simple por uno compuesto (id_estancia,
 * numero_identificacion): la unicidad pasa a exigirse sólo dentro de una
 * misma estancia. id_estancia ya tiene su propio índice no único (soporte
 * de la FK hacia `estancia`, ver 20260801000001), así que borrar el único
 * simple no lo deja sin índice, a diferencia del caso de
 * estancia.id_usuario en 20260801000017.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.removeIndex('ganado', 'numero_identificacion');
    await queryInterface.addIndex('ganado', ['id_estancia', 'numero_identificacion'], {
      unique: true,
      name: 'ganado_id_estancia_numero_identificacion_unique',
    });
    // Si esta migración ya se corrió y revirtió antes (down() dejó el
    // índice plano de abajo para sostener la FK mientras tanto), el
    // compuesto ya lo reemplaza como soporte de la FK: se limpia para que
    // up()/down() se puedan repetir sin chocar con un nombre de índice
    // duplicado.
    try {
      await queryInterface.removeIndex('ganado', 'ganado_id_estancia_fk_idx');
    } catch (error) {
      if (error?.original?.code !== 'ER_CANT_DROP_FIELD_OR_KEY') throw error;
    }
  },

  async down(queryInterface) {
    // El compuesto es el único índice que respalda la FK ganado.id_estancia
    // -> estancia (igual que id_usuario en 20260801000017): hay que darle
    // un reemplazo plano antes de poder soltarlo.
    await queryInterface.addIndex('ganado', ['id_estancia'], { name: 'ganado_id_estancia_fk_idx' });
    await queryInterface.removeIndex('ganado', 'ganado_id_estancia_numero_identificacion_unique');
    await queryInterface.addIndex('ganado', ['numero_identificacion'], {
      unique: true,
      name: 'numero_identificacion',
    });
  },
};
