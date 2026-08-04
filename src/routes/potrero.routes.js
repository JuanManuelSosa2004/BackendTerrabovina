'use strict';

const express = require('express');
const potreroController = require('../controllers/potrero.controller');
const ganadoController = require('../controllers/ganado.controller');
const ndviClimaController = require('../controllers/ndviClima.controller');
const estimacionController = require('../controllers/estimacion.controller');
const recomendacionController = require('../controllers/recomendacion.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requirePotreroOwnership } = require('../middlewares/ownership.middleware');

const router = express.Router();
router.use(requireAuth);
router.use('/:potreroId', requirePotreroOwnership());

// #14, #15, #16
router.get('/:potreroId', potreroController.getById);
router.patch('/:potreroId', potreroController.update);
router.delete('/:potreroId', potreroController.remove);

// #18, #22
router.post('/:potreroId/ganado', ganadoController.createEnPotrero);
router.get('/:potreroId/ganado', ganadoController.listByPotrero);

// #26, #27, #28
router.get('/:potreroId/ndvi', ndviClimaController.getNdviVigente);
router.get('/:potreroId/ndvi/consulta-rango', ndviClimaController.getNdviHistorico);
router.get('/:potreroId/dato-clima', ndviClimaController.getDatoClimaVigente);

// #29, #30
router.post('/:potreroId/estimacion-forrajera', estimacionController.crearEstimacionForrajera);
router.get('/:potreroId/estimacion-forrajera/historico', estimacionController.historicoForrajera);

// #31, #32 (#33 queda descartado, ver docs/backend-gap-analysis.md §3)
router.post('/:potreroId/estimacion-nutricional', estimacionController.crearEstimacionNutricional);
router.get('/:potreroId/estimacion-nutricional/historico', estimacionController.historicoNutricional);

// #34, #35
router.post('/:potreroId/recomendacion', recomendacionController.crear);
router.get('/:potreroId/recomendacion', recomendacionController.listar);

module.exports = router;
