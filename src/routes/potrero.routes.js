'use strict';

const express = require('express');
const controller = require('../controllers/potrero.controller');

const router = express.Router();

router.post('/', controller.create);
router.get('/:id', controller.getById);
router.patch('/:id/geometria', controller.updateGeometria);

module.exports = router;
