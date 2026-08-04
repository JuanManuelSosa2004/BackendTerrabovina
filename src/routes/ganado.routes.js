'use strict';

const express = require('express');
const controller = require('../controllers/ganado.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireGanadoOwnership } = require('../middlewares/ownership.middleware');

const router = express.Router();
router.use(requireAuth);
router.use('/:ganadoId', requireGanadoOwnership());

// #20, #21
router.get('/:ganadoId', controller.getById);
router.patch('/:ganadoId', controller.update);
router.delete('/:ganadoId', controller.remove);

module.exports = router;
