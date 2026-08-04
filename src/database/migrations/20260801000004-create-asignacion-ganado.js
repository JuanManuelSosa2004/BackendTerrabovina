'use strict';

/**
 * Vincula ganado a potrero con vigencia (fecha_desde / fecha_hasta NULL =
 * activa). Reemplaza a AsignacionRodeo, que nunca llegó a implementarse.
 *
 * Unicidad de asignación activa (docs/backend-gap-analysis.md §3, regla
 * transaccional #23): en MySQL 8 no existe índice único parcial, así que
 * se resuelve con una columna generada `activa_key` que vale `id_ganado`
 * cuando fecha_hasta es NULL y NULL en caso contrario, con un índice único
 * sobre esa columna. MySQL permite múltiples NULL en un índice único, por
 * lo que sólo se restringe la fila activa por animal.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('asignacion_ganado', {
      id_asignacion: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      id_ganado: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'ganado',
          key: 'id_ganado',
        },
        // RESTRICT (no CASCADE): MySQL no permite ON UPDATE CASCADE sobre
        // una columna de la que depende una columna generada (activa_key,
        // más abajo).
        onUpdate: 'RESTRICT',
        onDelete: 'RESTRICT',
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
      fecha_desde: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      fecha_hasta: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      estado: {
        type: Sequelize.STRING(50),
        allowNull: false,
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

    // MySQL reporta un error de FK engañoso ("Cannot add foreign key
    // constraint") si ADD COLUMN ... STORED y ADD UNIQUE INDEX van en la
    // misma sentencia ALTER TABLE; deben ir separadas.
    await queryInterface.sequelize.query(
      'ALTER TABLE `asignacion_ganado` ADD COLUMN `activa_key` INT GENERATED ALWAYS AS (IF(`fecha_hasta` IS NULL, `id_ganado`, NULL)) STORED;'
    );
    await queryInterface.sequelize.query(
      'ALTER TABLE `asignacion_ganado` ADD UNIQUE INDEX `asignacion_ganado_activa_unique` (`activa_key`);'
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      'ALTER TABLE `asignacion_ganado` DROP INDEX `asignacion_ganado_activa_unique`;'
    );
    await queryInterface.sequelize.query(
      'ALTER TABLE `asignacion_ganado` DROP COLUMN `activa_key`;'
    );
    await queryInterface.dropTable('asignacion_ganado');
  },
};
