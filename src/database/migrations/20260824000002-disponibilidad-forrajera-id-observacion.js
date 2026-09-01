'use strict';

/**
 * Vincula disponibilidad_forrajera con la observación satelital que le dio
 * origen. La migración 20260801000007 marca esa relación como "de
 * derivación, no FK" siguiendo el DER original, pero sin un vínculo real
 * integrarTasa (balanceForrajero.service.js) no tiene cómo saber la fecha
 * de CAPTURA de cada fila de disponibilidad_forrajera: solo tiene
 * fecha_calculo, que es cuándo se corrió el modelo, no la fecha del pasto
 * que describe. Ambas pueden diferir varios días, y el endpoint manual
 * (que a propósito no filtra duplicados, a diferencia del ciclo automático)
 * puede generar dos fecha_calculo distintas sobre la misma escena.
 *
 * Nullable: las filas ya persistidas no tienen esta columna. RESTRICT en
 * onDelete, igual que las FK de trazabilidad de recomendacion (migración
 * 20260801000009): ningún flujo de la aplicación borra físicamente una
 * fila de observacion_satelital — potrero y estancia usan baja lógica
 * desde la migración 20260801000017 — así que RESTRICT no choca con
 * ningún camino de baja existente.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('disponibilidad_forrajera', 'id_observacion', {
      type: Sequelize.INTEGER,
      allowNull: true,
      after: 'id_potrero',
      references: {
        model: 'observacion_satelital',
        key: 'id_observacion',
      },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('disponibilidad_forrajera', 'id_observacion');
  },
};
