const db = require('../src/database/models');
const sequelize = db.sequelize;

createERD({ source: sequelize })
  .then((filePath) => {
    console.log('ERD generado en', filePath);
  })
  .catch(console.error);