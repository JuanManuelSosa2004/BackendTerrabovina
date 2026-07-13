'use strict';

const { execSync } = require('child_process');

module.exports = async function globalSetup() {
  process.env.NODE_ENV = 'test';

  try {
    execSync('npx sequelize-cli db:create --env test', { stdio: 'inherit' });
  } catch (error) {
    // La base de test puede ya existir de una corrida anterior; seguimos.
  }

  execSync('npx sequelize-cli db:migrate --env test', { stdio: 'inherit' });
};
