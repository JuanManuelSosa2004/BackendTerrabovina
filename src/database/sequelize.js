const { Sequelize } = require('sequelize');
const config = require('./config/config');

const env = process.env.NODE_ENV || 'development';
const dbConfig = config[env];

const sequelize = new Sequelize(dbConfig.database, dbConfig.username, dbConfig.password, {
  host: dbConfig.host,
  port: dbConfig.port,
  dialect: dbConfig.dialect,
  timezone: dbConfig.timezone,
  logging: dbConfig.logging === false ? false : env === 'development' ? console.log : false,
  define: dbConfig.define,
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
});

async function testConnection() {
  try {
    await sequelize.authenticate();
    console.log(`Database connection established (env: ${env}).`);
  } catch (error) {
    console.error('Unable to connect to the database:', error.message);
    throw error;
  }
}

module.exports = { sequelize, testConnection };
