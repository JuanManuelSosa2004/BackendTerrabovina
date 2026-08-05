'use strict';

/**
 * Cabecera del evento operativo de trasladar un lote de animales de un
 * potrero origen a un potrero destino. Complementa a asignacion_ganado
 * (que sólo modela la vigencia "animal en potrero") con el registro del
 * movimiento en sí: quién lo hizo, cuándo, entre qué potreros y con qué
 * observaciones. El detalle (qué animales integraron el lote) vive en
 * traslado_ganado_detalle (próxima migración).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('traslado_ganado', {
      id_traslado: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      id_estancia: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'estancia',
          key: 'id_estancia',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      // onUpdate RESTRICT (no CASCADE): MySQL no permite un CHECK
      // constraint sobre una columna que participa de una FK con acción
      // referencial CASCADE/SET NULL (mismo motivo que asignacion_ganado.
      // id_ganado, ver migración 20260801000004). Los id_potrero son PK
      // autoincremental que la aplicación nunca actualiza, así que
      // RESTRICT no cambia el comportamiento real.
      id_potrero_origen: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'potrero',
          key: 'id_potrero',
        },
        onUpdate: 'RESTRICT',
        onDelete: 'RESTRICT',
      },
      id_potrero_destino: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'potrero',
          key: 'id_potrero',
        },
        onUpdate: 'RESTRICT',
        onDelete: 'RESTRICT',
      },
      fecha_movimiento: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      observaciones: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      id_usuario: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'usuario',
          key: 'id_usuario',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
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

    await queryInterface.addIndex('traslado_ganado', ['id_estancia', 'fecha_movimiento'], {
      name: 'traslado_ganado_estancia_fecha_idx',
    });
    await queryInterface.addIndex('traslado_ganado', ['id_potrero_origen', 'fecha_movimiento'], {
      name: 'traslado_ganado_origen_fecha_idx',
    });
    await queryInterface.addIndex('traslado_ganado', ['id_potrero_destino', 'fecha_movimiento'], {
      name: 'traslado_ganado_destino_fecha_idx',
    });

    // CHECK constraint (MySQL 8.0.16+, enforced): un traslado no puede
    // tener el mismo potrero como origen y destino. Es una segunda barrera
    // a nivel de esquema; la aplicación ya lo valida antes de llegar acá.
    await queryInterface.sequelize.query(
      'ALTER TABLE `traslado_ganado` ADD CONSTRAINT `traslado_ganado_origen_destino_check` CHECK (`id_potrero_origen` <> `id_potrero_destino`);'
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      'ALTER TABLE `traslado_ganado` DROP CHECK `traslado_ganado_origen_destino_check`;'
    );
    await queryInterface.dropTable('traslado_ganado');
  },
};
