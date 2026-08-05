const express = require('express');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Recursos en singular, anidados según docs/REST_API_TerraBovina V2.xlsx.
app.use('/api/v2/auth', require('./routes/auth.routes'));
app.use('/api/v2/usuarios', require('./routes/usuario.routes'));
app.use('/api/v2/estancia', require('./routes/estancia.routes'));
app.use('/api/v2/potrero', require('./routes/potrero.routes'));
app.use('/api/v2/ganado', require('./routes/ganado.routes'));
app.use('/api/v2/asignacion-ganado', require('./routes/asignacionGanado.routes'));
app.use('/api/v2/traslado-ganado', require('./routes/trasladoGanado.routes'));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// §3.2: "las solicitudes y respuestas utilizan JSON como formato general".
// Sin este handler, un error no controlado en un route handler async cae
// en la página de error HTML por defecto de Express.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

module.exports = app;
