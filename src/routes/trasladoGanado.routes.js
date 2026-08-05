'use strict';

const express = require('express');
const controller = require('../controllers/trasladoGanado.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireTrasladoGanadoOwnership } = require('../middlewares/ownership.middleware');

const router = express.Router();
router.use(requireAuth);

// #2
router.get('/', controller.listar);

// #3
router.get('/:trasladoId', requireTrasladoGanadoOwnership(), controller.getById);

module.exports = router;
