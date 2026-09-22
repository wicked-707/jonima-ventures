const {
  validateCreateUserPayload,
} = require('./users.validation');

const usersService = require('./users.service');

async function createUser(req, res, next) {
  try {
    const validation =
      validateCreateUserPayload(req.body);

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validation.errors,
      });
    }

    if (!req.auth?.userId || !req.auth?.companyId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const result = await usersService.createUser({
      creatorUserId: req.auth.userId,
      companyId: req.auth.companyId,
      payload: req.body,
    });

    return res.status(201).json({
      success: true,
      message: 'User account created successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

async function approveUser(req, res, next) {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId is required',
      });
    }

    if (!req.auth?.userId || !req.auth?.companyId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const result = await usersService.approveUser({
      approverUserId: req.auth.userId,
      companyId: req.auth.companyId,
      userId,
      reason: req.body?.reason,
      notes: req.body?.notes,
    });

    return res.status(200).json({
      success: true,
      message: 'User account approved successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

async function resetUserPassword(req, res, next) {
  try {
    const result = await usersService.resetUserPassword({
      approverUserId: req.auth.userId,
      companyId: req.auth.companyId,
      userId: req.params.userId,
    });

    return res.status(200).json({
      success: true,
      message: 'Temporary password generated successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createUser,
  approveUser,
  resetUserPassword,
};

