require('dotenv').config();

const base = {
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  dialect: 'mysql',
  timezone: '+00:00',
  define: {
    underscored: true,
  },
};

module.exports = {
  development: {
    ...base,
    database: process.env.DB_NAME,
  },
  test: {
    ...base,
    username: process.env.DB_ROOT_USER || base.username,
    password: process.env.DB_ROOT_PASSWORD || base.password,
    database: process.env.DB_NAME_TEST || `${process.env.DB_NAME}_test`,
    logging: false,
  },
  production: {
    ...base,
    database: process.env.DB_NAME,
    logging: false,
  },
};
