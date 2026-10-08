const express = require('express');

const usersController = require('./users.controller');

const { authenticate } = require('../../middleware/auth');

const {
  requirePasswordChangeCompleted,
} = require('../../middleware/passwordPolicy');

const {
  requirePermission,
} = require('../../middleware/permissions');

const router = express.Router();

router.post(
  '/',
  authenticate,
  requirePasswordChangeCompleted,
  requirePermission('user.create', {
    resourceType: 'USER',
    action: 'CREATE',
  }),
  usersController.createUser
);

router.post(
  '/:userId/approve',
  authenticate,
  requirePasswordChangeCompleted,
  requirePermission('user.approve', {
    resourceType: 'USER',
    resourceId: 'userId',
    action: 'APPROVE',
  }),
  usersController.approveUser
);

router.post(
  '/:userId/assignments',
  authenticate,
  requirePasswordChangeCompleted,
  requirePermission('user.assign', {
    resourceType: 'USER',
    resourceId: 'userId',
    action: 'ASSIGN',
  }),
  usersController.assignUser
);

router.post(
  '/:userId/reset-password',
  authenticate,
  requirePasswordChangeCompleted,
  requirePermission('user.activate', {
    resourceType: 'USER',
    resourceId: 'userId',
    action: 'RESET_PASSWORD',
  }),
  usersController.resetUserPassword
);

module.exports = router;
