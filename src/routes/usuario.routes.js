'use strict';

const express = require('express');
const controller = require('../controllers/usuario.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/me', requireAuth, controller.getMe);
router.patch('/me', requireAuth, controller.updateMe);

module.exports = router;
