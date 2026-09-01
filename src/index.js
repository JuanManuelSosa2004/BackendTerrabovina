require('dotenv').config();
const app = require('./app');
const { testConnection } = require('./database/sequelize');
const { iniciarSchedulerEstimacionForrajera } = require('./jobs/estimacionForrajeraCron.job');

const PORT = process.env.PORT || 3000;

testConnection()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

    // El scheduler corre en proceso (setInterval): con más de una instancia
    // del backend viva a la vez, cada una arrancaría su propio timer y
    // duplicaría llamadas al modelo predictivo (ver .env.example). Prender
    // esto en una sola instancia hasta mover el ciclo fuera del backend.
    if (process.env.SCHEDULER_ENABLED === 'true') {
      iniciarSchedulerEstimacionForrajera();
    }
  })
  .catch(() => {
    process.exit(1);
  });
