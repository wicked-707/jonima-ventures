const express = require('express');

const authController = require('./auth.controller');
const { authenticate } = require('../../middleware/auth');

const router = express.Router();

router.post('/login', authController.login);

router.get('/me', authenticate, authController.me);

router.post('/logout', authenticate, authController.logout);

router.post('/change-password', authenticate, authController.changePassword);

module.exports = router;