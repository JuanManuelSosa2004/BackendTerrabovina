'use strict';

/**
 * DELETE /estancia/:id (CA001) pasa de borrado físico en cascada a baja
 * lógica en cascada (mismo patrón que Potrero y Ganado, ver migraciones
 * 20260713170122 y 20260801000001): así traslado_ganado/traslado_ganado_
 * detalle (FK RESTRICT hacia ganado/asignacion_ganado/potrero/estancia,
 * migraciones 20260801000015/16) nunca se ven afectadas por la baja de una
 * estancia, sin importar cuánto historial de traslados tenga.
 *
 * El índice único id_usuario se elimina porque MySQL no soporta índices
 * únicos parciales: si se mantuviera, un usuario no podría crear una
 * segunda estancia después de dar de baja la primera. La unicidad
 * "a lo sumo una estancia ACTIVA por usuario" se pasa a validar en la
 * aplicación (estancia.controller#create).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // MySQL no deja soltar el índice único 'id_usuario' directamente: es el
    // único índice que respalda la FK estancia.id_usuario -> usuario. Se
    // agrega primero un índice plano equivalente para que la FK siga
    // teniendo soporte, recién ahí se puede soltar el único.
    await queryInterface.addIndex('estancia', ['id_usuario'], { name: 'estancia_id_usuario_fk_idx' });
    await queryInterface.removeIndex('estancia', 'id_usuario');
    await queryInterface.addColumn('estancia', 'activo', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('estancia', 'activo');
    await queryInterface.addIndex('estancia', ['id_usuario'], { unique: true, name: 'id_usuario' });
    await queryInterface.removeIndex('estancia', 'estancia_id_usuario_fk_idx');
  },
};
