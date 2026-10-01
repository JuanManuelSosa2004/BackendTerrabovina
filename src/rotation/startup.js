'use strict';
let ready = false;
async function initialize() {
  if (process.env.ROTATION_ENABLED === 'false') return false;
  const { sequelize } = require('../database/sequelize');
  try {
    for (const name of ['20261001000001-rotacion', '20261001000002-rotacion-advertencias']) {
      await require(`../database/migrations/${name}`).up(sequelize.getQueryInterface(), require('sequelize'));
      await sequelize.query('INSERT IGNORE INTO `SequelizeMeta` (`name`) VALUES (:name)', {
        replacements: { name: `${name}.js` },
      });
    }
    ready = true;
    console.log('Schema ready: rotacion');
  } catch (error) {
    ready = false;
    console.error('Rotation unavailable; existing API remains active:', error.message);
  }
  return ready;
}
module.exports = { initialize, isReady: () => ready };
