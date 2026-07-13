'use strict';

const express = require('express');
const controller = require('../controllers/estancia.controller');

const router = express.Router();

router.post('/', controller.create);
router.get('/:id', controller.getById);
router.get('/:id/kml', controller.getKml);
router.patch('/:id/geometria', controller.updateGeometria);

module.exports = router;
