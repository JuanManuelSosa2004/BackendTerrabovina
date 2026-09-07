require('dotenv').config();
const app = require('./app');
const { testConnection } = require('./database/sequelize');

const PORT = process.env.PORT || 3000;

testConnection()
  .then(async () => {
    // Cambio aditivo e idempotente, antes de atender altas y balances.
    await require('./database/migrations/20260907000001-asignacion-dmi-ingreso').up(
      require('./database/sequelize').sequelize.getQueryInterface(), require('sequelize'));
    await require('./database/sequelize').sequelize.query(
      'INSERT IGNORE INTO `SequelizeMeta` (`name`) VALUES (:name)',
      { replacements: { name: '20260907000001-asignacion-dmi-ingreso.js' } }
    );
    console.log('Schema ready: dmi_ingreso_kg_dia');
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      if (process.env.STOCK_DAILY_SCHEDULER_ENABLED === 'true') {
        require('./services/stockDailyScheduler').start();
      }
    });
  })
  .catch(error => {
    console.error('Backend startup failed:', error.message);
    process.exit(1);
  });
