require('dotenv').config();
const app = require('./app');
const { testConnection } = require('./database/sequelize');

const PORT = process.env.PORT || 3000;

testConnection()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      if (process.env.STOCK_DAILY_SCHEDULER_ENABLED === 'true') {
        require('./services/stockDailyScheduler').start();
      }
    });
  })
  .catch(() => {
    process.exit(1);
  });
