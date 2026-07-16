'use strict';

const express = require('express');
const controller = require('../controllers/rodeo.controller');

const router = express.Router();

router.post('/', controller.create);
router.get('/:id', controller.getById);
router.get('/:id/ganado', controller.listGanado);
router.patch('/:id', controller.update);
router.patch('/:id/potrero', controller.updatePotrero);

module.exports = router;
