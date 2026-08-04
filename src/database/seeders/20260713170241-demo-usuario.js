'use strict';

const DEMO_EMAIL = 'admin@terrabovina.com';
// Contraseña en claro: DemoTerrabovina123 (sólo para este seed de desarrollo).
const DEMO_PASSWORD_HASH = '$2b$10$zHHPq0uQ54xZdkXp7Nd0W.reEr3cYezoJzZub9UyngJC60uLDaeKO';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert('usuario', [
      {
        nombre: 'Administrador Demo',
        email: DEMO_EMAIL,
        password_hash: DEMO_PASSWORD_HASH,
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
