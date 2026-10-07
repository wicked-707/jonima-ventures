const customersService = require('./customers.service');
const {
  validateCreateCustomerPayload,
} = require('./customers.validation');

async function createCustomer(req, res, next) {
  try {
    const errors =
      validateCreateCustomerPayload(req.body);

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid customer payload',
        errors,
      });
    }

    if (!req.auth) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const result =
      await customersService.createCustomer({
        creatorUserId: req.auth.userId,
        companyId: req.auth.companyId,
        payload: req.body,
      });

    return res.status(201).json({
      success: true,
      message: 'Customer created successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createCustomer,
};
