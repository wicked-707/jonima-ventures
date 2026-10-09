const express = require('express');

const customersController = require('./customers.controller');

const { authenticate } = require('../../middleware/auth');

const {
  requirePasswordChangeCompleted,
} = require('../../middleware/passwordPolicy');

const {
  requirePermission,
} = require('../../middleware/permissions');

const router = express.Router();

router.get(
  '/me',
  authenticate,
  requirePasswordChangeCompleted,
  requirePermission('customer.view', {
    resourceType: 'CUSTOMER',
    action: 'VIEW',
  }),
  customersController.getMyCustomerProfile
);

router.post(
  '/',
  authenticate,
  requirePasswordChangeCompleted,
  requirePermission('customer.create', {
    resourceType: 'CUSTOMER',
    action: 'CREATE',
  }),
  customersController.createCustomer
);

router.post(
  '/:customerId/approve',
  authenticate,
  requirePasswordChangeCompleted,
  requirePermission('customer.approve', {
    resourceType: 'CUSTOMER',
    resourceId: 'customerId',
    action: 'APPROVE',
  }),
  customersController.approveCustomer
);

module.exports = router;
