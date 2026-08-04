'use strict';

const express = require('express');
const controller = require('../controllers/asignacionGanado.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireAsignacionOwnership } = require('../middlewares/ownership.middleware');

const router = express.Router();
router.use(requireAuth);

// #23
router.post('/', controller.crear);

// #24
router.get('/:asignacionId', requireAsignacionOwnership(), controller.getById);

module.exports = router;
