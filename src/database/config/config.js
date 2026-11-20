require('dotenv').config();
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

if (process.env.NODE_ENV === 'production') {
  const host = process.env.DB_HOST || '';
  if (!/^terrabovina-aws-db\.[a-z0-9]+\.us-east-1\.rds\.amazonaws\.com$/.test(host) ||
      process.env.DB_NAME !== 'terrabovina_aws' || !process.env.DB_PASSWORD || !process.env.DB_USER) {
    throw new Error('El despliegue AWS requiere la base terrabovina_aws en su RDS dedicado de Virginia.');
  }
}

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
    dialectOptions: {
      ssl: {
        ca: readFileSync(join(__dirname, '../../../infra/aws/us-east-1-bundle.pem'), 'utf8'),
        rejectUnauthorized: true,
        verifyIdentity: true,
      },
    },
    logging: false,
  },
};
