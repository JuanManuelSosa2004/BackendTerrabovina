'use strict';

const express = require('express');
const controller = require('../controllers/ganado.controller');
const trasladoGanadoController = require('../controllers/trasladoGanado.controller');
const asignacionGanadoController = require('../controllers/asignacionGanado.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireGanadoOwnership } = require('../middlewares/ownership.middleware');

const router = express.Router();
router.use(requireAuth);
router.use('/:ganadoId', requireGanadoOwnership());

// #20, #21
router.get('/:ganadoId', controller.getById);
router.patch('/:ganadoId', controller.update);
router.delete('/:ganadoId', controller.remove);

// traslado-ganado: recorrido cronológico del animal a través de sus
// traslados entre potreros.
router.get('/:ganadoId/recorrido', trasladoGanadoController.recorridoByGanado);

// asignacion-ganado: histórico asignación a asignación del animal
// (complementa a /recorrido, que es la vista traslado a traslado).
router.get('/:ganadoId/asignaciones', asignacionGanadoController.listHistorialByGanado);

module.exports = router;
