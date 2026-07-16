'use strict';

const express = require('express');
const controller = require('../controllers/ganado.controller');

const router = express.Router();

router.post('/', controller.create);
router.get('/:id', controller.getById);
router.patch('/:id', controller.update);
router.patch('/:id/rodeo', controller.updateRodeo);

module.exports = router;
