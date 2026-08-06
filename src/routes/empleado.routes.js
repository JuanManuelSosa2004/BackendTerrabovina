'use strict';

const express = require('express');
const controller = require('../controllers/empleado.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireEmpleadoOwnership } = require('../middlewares/ownership.middleware');

const router = express.Router();
router.use(requireAuth);
router.use('/:empleadoId', requireEmpleadoOwnership());

router.get('/:empleadoId', controller.getById);
router.patch('/:empleadoId', controller.update);
router.delete('/:empleadoId', controller.remove);

module.exports = router;
