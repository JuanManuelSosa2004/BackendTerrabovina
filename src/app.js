const express = require('express');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
// app.use('/api/...', require('./routes/...'));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
