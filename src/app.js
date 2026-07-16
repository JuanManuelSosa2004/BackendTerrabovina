const express = require('express');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/estancias', require('./routes/estancia.routes'));
app.use('/potreros', require('./routes/potrero.routes'));
app.use('/rodeos', require('./routes/rodeo.routes'));
app.use('/ganados', require('./routes/ganado.routes'));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
