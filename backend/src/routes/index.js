const express = require('express');

const authRoutes = require('../modules/auth/auth.routes');
const usersRoutes = require('../modules/users/users.routes');
const regionsRoutes = require('../modules/regions/regions.routes');
const customersRoutes = require('../modules/customers/customers.routes');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'Jonima Ventures API',
    status: 'healthy',
  });
});

router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/regions', regionsRoutes);
router.use('/customers', customersRoutes);

module.exports = router;
