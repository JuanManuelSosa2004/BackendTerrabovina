'use strict';

const express = require('express');
const controller = require('../controllers/auth.controller');

const router = express.Router();

router.post('/registro', controller.registro);
router.post('/login', controller.login);
router.post('/recuperar-contrasena', controller.recuperarContrasena);
router.post('/restablecer-contrasena', controller.restablecerContrasena);

module.exports = router;
