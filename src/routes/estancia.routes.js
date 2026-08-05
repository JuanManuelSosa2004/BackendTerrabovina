'use strict';

const express = require('express');
const estanciaController = require('../controllers/estancia.controller');
const potreroController = require('../controllers/potrero.controller');
const ganadoController = require('../controllers/ganado.controller');
const asignacionGanadoController = require('../controllers/asignacionGanado.controller');
const trasladoGanadoController = require('../controllers/trasladoGanado.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireEstanciaOwnership } = require('../middlewares/ownership.middleware');

const router = express.Router();
router.use(requireAuth);

// #7, #8
router.post('/', estanciaController.create);
router.get('/', estanciaController.getMine);

// #9, #10, #11
router.get('/:estanciaId', requireEstanciaOwnership(), estanciaController.getById);
router.patch('/:estanciaId', requireEstanciaOwnership(), estanciaController.update);
router.delete('/:estanciaId', requireEstanciaOwnership(), estanciaController.remove);

// #12, #13
router.post('/:estanciaId/potrero', requireEstanciaOwnership(), potreroController.create);
router.get('/:estanciaId/potrero', requireEstanciaOwnership(), potreroController.listByEstancia);

// #17, #19
router.post('/:estanciaId/ganado', requireEstanciaOwnership(), ganadoController.createEnEstancia);
router.get('/:estanciaId/ganado', requireEstanciaOwnership(), ganadoController.listByEstancia);

// #25
router.get(
  '/:estanciaId/asignaciones-ganado',
  requireEstanciaOwnership(),
  asignacionGanadoController.listHistorialByEstancia
);

// traslado-ganado: analíticas agregadas de traslados de la estancia.
router.get(
  '/:estanciaId/analiticas/traslado-ganado',
  requireEstanciaOwnership(),
  trasladoGanadoController.analiticas
);

module.exports = router;
