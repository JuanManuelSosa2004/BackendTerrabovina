'use strict';

const { execSync } = require('child_process');

module.exports = async function globalTeardown() {
  process.env.NODE_ENV = 'test';
  execSync('npx sequelize-cli db:migrate:undo:all --env test', { stdio: 'inherit' });
};
