'use strict';

const DEMO_EMAIL = 'admin@terrabovina.com';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert('usuario', [
      {
        nombre: 'Administrador Demo',
        email: DEMO_EMAIL,
        // Placeholder: no hay lógica de hashing de contraseñas en el alcance
        // de esta migración; reemplazar por un hash real antes de usar en un
        // entorno real.
        password_hash: 'CAMBIAR_ESTE_HASH',
        telefono: null,
        ultimo_acceso: null,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('usuario', { email: DEMO_EMAIL });
  },
};
