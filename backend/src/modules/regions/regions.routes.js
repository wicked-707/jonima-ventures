const express = require('express');

const regionsController = require('./regions.controller');
const { authenticate } = require('../../middleware/auth');
const {
  requirePermission,
} = require('../../middleware/permissions');

const router = express.Router();

router.post(
  '/',
  authenticate,
  requirePermission('region.create', {
    resourceType: 'REGION',
    action: 'CREATE',
  }),
  regionsController.createRegion
);

router.get(
  '/',
  authenticate,
  requirePermission('region.view', {
    resourceType: 'REGION',
    action: 'VIEW',
  }),
  regionsController.listRegions
);

router.get(
  '/:regionId',
  authenticate,
  requirePermission('region.view', {
    resourceType: 'REGION',
    resourceId: 'regionId',
    action: 'VIEW',
  }),
  regionsController.getRegion
);

router.patch(
  '/:regionId',
  authenticate,
  requirePermission('region.update', {
    resourceType: 'REGION',
    resourceId: 'regionId',
    action: 'UPDATE',
  }),
  regionsController.updateRegion
);

module.exports = router;
