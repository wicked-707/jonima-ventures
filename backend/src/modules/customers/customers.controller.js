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

async function getMyCustomerProfile(
  req,
  res,
  next
) {
  try {
    if (!req.auth) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const result =
      await customersService.getMyCustomerProfile({
        userId: req.auth.userId,
        companyId: req.auth.companyId,
      });

    return res.status(200).json({
      success: true,
      message: 'Customer profile retrieved successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

async function approveCustomer(req, res, next) {
  try {
    if (!req.auth) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const { customerId } = req.params;

    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: 'customerId is required',
      });
    }

    const result =
      await customersService.approveCustomer({
        approverUserId: req.auth.userId,
        companyId: req.auth.companyId,
        customerId,
        reason: req.body?.reason,
        notes: req.body?.notes,
      });

    return res.status(200).json({
      success: true,
      message: 'Customer approved successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}


async function getMyKycOverview(req, res, next) {
  try {
    const overview =
      await customersService.getMyKycOverview({
        userId: req.auth.userId,
        companyId: req.auth.companyId,
      });

    return res.status(200).json({
      success: true,
      data: overview,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createCustomer,
  approveCustomer,
  getMyCustomerProfile,
  getMyKycOverview,
};
