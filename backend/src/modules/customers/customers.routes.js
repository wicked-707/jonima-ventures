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

module.exports = router;
