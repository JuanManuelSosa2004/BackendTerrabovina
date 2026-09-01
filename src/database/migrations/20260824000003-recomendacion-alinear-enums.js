'use strict';

/**
 * Alinea los ENUM de `recomendacion` con la Figura 3.5 del PFI (diagrama de
 * clases entregado). La rúbrica exige que los diagramas reflejen fielmente la
 * implementación, y hoy divergen en los tres atributos:
 *
 *   estado     BD: PENDIENTE, REALIZADA, RECHAZADA
 *              Fig 3.5: PENDIENTE, ACEPTADA, RECHAZADA, APLICADA
 *   prioridad  BD: '1', '2', '3'   ·   Fig 3.5: BAJA, MEDIA, ALTA
 *   tipo       BD: VARCHAR(50) sin cerrar   ·   Fig 3.5: seis valores
 *
 * Se unifica hacia el diagrama: ya está entregado y es más legible ('1' no
 * comunica nada; ALTA sí).
 *
 * El ciclo de vida pasa de tres a cuatro estados. REALIZADA fusionaba dos
 * momentos distintos —que el productor acepte la recomendación y que
 * efectivamente la ejecute—, distinción necesaria para poder vincular una
 * recomendación aplicada con el TrasladoGanado que la materializó.
 *
 * ORDEN DE OPERACIONES: los datos existentes se migran ANTES de cambiar el
 * tipo. Un changeColumn sobre un ENUM cuyos valores actuales no pertenecen al
 * conjunto nuevo trunca las filas a cadena vacía en MySQL sin modo estricto, o
 * falla con él. Por eso cada paso amplía primero el conjunto, después traduce
 * los datos y recién entonces lo restringe.
 */

const TIPOS = [
  'MOVER_GANADO',
  'REDUCIR_CARGA',
  'AUMENTAR_CARGA',
  'SUPLEMENTAR',
  'MANTENER',
  'NUEVA_MEDICION',
];

const ESTADOS = ['PENDIENTE', 'ACEPTADA', 'RECHAZADA', 'APLICADA'];
const PRIORIDADES = ['BAJA', 'MEDIA', 'ALTA'];

module.exports = {
  async up(queryInterface, Sequelize) {
    const t = await queryInterface.sequelize.transaction();
    try {
      // ── estado ────────────────────────────────────────────────────────────
      // Conjunto ampliado: conviven los valores viejos y los nuevos.
      await queryInterface.changeColumn(
        'recomendacion',
        'estado',
        {
          type: Sequelize.ENUM(...ESTADOS, 'REALIZADA'),
          allowNull: false,
          defaultValue: 'PENDIENTE',
        },
        { transaction: t }
      );
      // REALIZADA describía una recomendación ya ejecutada: mapea a APLICADA.
      await queryInterface.sequelize.query(
        "UPDATE `recomendacion` SET estado = 'APLICADA' WHERE estado = 'REALIZADA'",
        { transaction: t }
      );
      await queryInterface.changeColumn(
        'recomendacion',
        'estado',
        {
          type: Sequelize.ENUM(...ESTADOS),
          allowNull: false,
          defaultValue: 'PENDIENTE',
        },
        { transaction: t }
      );

      // ── prioridad ─────────────────────────────────────────────────────────
      // '1' era la más urgente y '3' la menos (ver la migración
      // 20260801000013), de modo que el mapeo invierte el orden numérico.
      await queryInterface.changeColumn(
        'recomendacion',
        'prioridad',
        { type: Sequelize.ENUM(...PRIORIDADES, '1', '2', '3'), allowNull: true },
        { transaction: t }
      );
      await queryInterface.sequelize.query(
        "UPDATE `recomendacion` SET prioridad = CASE prioridad " +
          "WHEN '1' THEN 'ALTA' WHEN '2' THEN 'MEDIA' WHEN '3' THEN 'BAJA' " +
          'ELSE prioridad END',
        { transaction: t }
      );
      await queryInterface.changeColumn(
        'recomendacion',
        'prioridad',
        { type: Sequelize.ENUM(...PRIORIDADES), allowNull: true },
        { transaction: t }
      );

      // ── tipo ──────────────────────────────────────────────────────────────
      // Único de los nueve ENUM que quedaba sin cerrar (docs/backend-gap-analysis.md §2).
      // El placeholder ya emitía MANTENER, REDUCIR_CARGA y AUMENTAR_CARGA, que
      // pertenecen al conjunto; cualquier valor ajeno se normaliza antes de
      // restringir el tipo para no perder la fila.
      await queryInterface.sequelize.query(
        `UPDATE \`recomendacion\` SET tipo = 'MANTENER'
         WHERE tipo NOT IN (${TIPOS.map((v) => `'${v}'`).join(', ')})`,
        { transaction: t }
      );
      await queryInterface.changeColumn(
        'recomendacion',
        'tipo',
        { type: Sequelize.ENUM(...TIPOS), allowNull: false },
        { transaction: t }
      );

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.changeColumn(
        'recomendacion',
        'tipo',
        { type: Sequelize.STRING(50), allowNull: false },
        { transaction: t }
      );

      await queryInterface.changeColumn(
        'recomendacion',
        'prioridad',
        { type: Sequelize.ENUM(...PRIORIDADES, '1', '2', '3'), allowNull: true },
        { transaction: t }
      );
      await queryInterface.sequelize.query(
        "UPDATE `recomendacion` SET prioridad = CASE prioridad " +
          "WHEN 'ALTA' THEN '1' WHEN 'MEDIA' THEN '2' WHEN 'BAJA' THEN '3' " +
          'ELSE prioridad END',
        { transaction: t }
      );
      await queryInterface.changeColumn(
        'recomendacion',
        'prioridad',
        { type: Sequelize.ENUM('1', '2', '3'), allowNull: true },
        { transaction: t }
      );

      // ACEPTADA no existía en el conjunto anterior: se colapsa junto a
      // APLICADA sobre REALIZADA, que es el estado que las englobaba.
      await queryInterface.changeColumn(
        'recomendacion',
        'estado',
        {
          type: Sequelize.ENUM('PENDIENTE', 'REALIZADA', 'RECHAZADA', 'ACEPTADA', 'APLICADA'),
          allowNull: false,
          defaultValue: 'PENDIENTE',
        },
        { transaction: t }
      );
      await queryInterface.sequelize.query(
        "UPDATE `recomendacion` SET estado = 'REALIZADA' WHERE estado IN ('ACEPTADA', 'APLICADA')",
        { transaction: t }
      );
      await queryInterface.changeColumn(
        'recomendacion',
        'estado',
        {
          type: Sequelize.ENUM('PENDIENTE', 'REALIZADA', 'RECHAZADA'),
          allowNull: false,
          defaultValue: 'PENDIENTE',
        },
        { transaction: t }
      );

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
