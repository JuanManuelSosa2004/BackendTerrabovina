'use strict';

/**
 * El DER V2 (docs/backend-gap-analysis.md) elimina Rodeo: el ganado pasa a
 * colgar directamente de la estancia y se vincula al potrero mediante
 * AsignacionGanado (migración siguiente). Se recrea la tabla en lugar de
 * alterarla porque cambian tanto la FK principal como el tipo de varias
 * columnas.
 *
 * Se agregan dos campos fuera del DER, ambos señalados como huecos en
 * docs/backend-gap-analysis.md §5:
 *  - condicion_corporal: entrada numérica del modelo de estimación de
 *    demanda (§3.8), ausente en el DER (§5.1). Nullable a nivel de
 *    columna: el modelo sólo la usa para categoria=VACA (única categoría
 *    con relevamiento sistemático de esta variable, según §3.7.4 del PFI),
 *    así que la obligatoriedad condicional se valida a nivel de aplicación
 *    (controller de ganado), no de esquema.
 *  - activo: el DER quitó `estado` (ACTIVO/VENDIDO/MUERTO) sin reponer una
 *    forma de dar de baja un animal sin destruir su historial de
 *    asignaciones (§5.3). Se resuelve con un booleano de baja lógica,
 *    igual al patrón ya usado en Potrero.
 *
 * sexo, categoria y estado_fisiologico quedan como VARCHAR(50): son 3 de
 * los 9 ENUM sin conjunto de valores todavía (§2 del documento).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.dropTable('ganado');

    await queryInterface.createTable('ganado', {
      id_ganado: {
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
      numero_identificacion: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true,
      },
      fecha_nacimiento: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      sexo: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      categoria: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      peso_kg: {
        type: Sequelize.DECIMAL(6, 2),
        allowNull: true,
      },
      condicion_corporal: {
        type: Sequelize.DECIMAL(3, 1),
        allowNull: true,
      },
      estado_fisiologico: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      observaciones: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      activo: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
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

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('ganado');

    await queryInterface.createTable('ganado', {
      id_ganado: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      id_rodeo: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'rodeo',
          key: 'id_rodeo',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      numero_identificacion: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true,
      },
      fecha_nacimiento: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      sexo: {
        type: Sequelize.ENUM('M', 'F'),
        allowNull: false,
      },
      categoria: {
        type: Sequelize.ENUM('TERNERO', 'VAQUILLONA', 'NOVILLO', 'VACA', 'TORO'),
        allowNull: false,
      },
      peso_kg: {
        type: Sequelize.DECIMAL(6, 2),
        allowNull: true,
      },
      estado: {
        type: Sequelize.ENUM('ACTIVO', 'VENDIDO', 'MUERTO'),
        allowNull: false,
        defaultValue: 'ACTIVO',
      },
      observaciones: {
        type: Sequelize.STRING(500),
        allowNull: true,
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
};
