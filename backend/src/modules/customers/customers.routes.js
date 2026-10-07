const express = require('express');

const customersController = require('./customers.controller');
const { authenticate } = require('../../middleware/auth');
const {
  requirePermission,
} = require('../../middleware/permissions');

const router = express.Router();

router.post(
  '/',
  authenticate,
  requirePermission('customer.create', {
    resourceType: 'CUSTOMER',
    action: 'CREATE',
  }),
  customersController.createCustomer
);

router.post(
  '/:customerId/approve',
  authenticate,
  requirePermission('customer.approve', {
    resourceType: 'CUSTOMER',
    resourceId: 'customerId',
    action: 'APPROVE',
  }),
  customersController.approveCustomer
);

module.exports = router;
