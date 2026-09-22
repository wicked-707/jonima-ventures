const authService = require('./auth.service');
const {
  validateLoginPayload,
  validateChangePasswordPayload,
} = require('./auth.validation');
async function login(req, res, next) {
  try {
    const validation = validateLoginPayload(req.body);

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validation.errors,
      });
    }

    const result = await authService.login({
      identifier: validation.data.identifier,
      password: validation.data.password,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      deviceLabel: req.get('x-device-label'),
    });

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: result,
    });
  } catch (error) {
    if (
      error.message === 'Invalid login credentials' ||
      error.message === 'Account has no active role'
    ) {
      return res.status(401).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message.startsWith('Account cannot log in')) {
      return res.status(403).json({
        success: false,
        message: error.message,
      });
    }

    return next(error);
  }
}

async function me(req, res, next) {
  try {
    const result = await authService.getCurrentUser(
      req.auth.sessionId
    );

    return res.status(200).json({
      success: true,
      message: 'Current user retrieved successfully',
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

async function logout(req, res, next) {
  try {
    await authService.logout(req.auth.sessionId);

    return res.status(200).json({
      success: true,
      message: 'Logout successful',
    });
  } catch (error) {
    return next(error);
  }
}

async function changePassword(req, res, next) {
  try {
    const validation =
      validateChangePasswordPayload(req.body);

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validation.errors,
      });
    }

    if (!req.auth?.userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const result = await authService.changePassword({
      userId: req.auth.userId,
      currentPassword: req.body.currentPassword,
      newPassword: req.body.newPassword,
    });

    return res.status(200).json({
      success: true,
      message: 'Password changed successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  login,
  me,
  logout,
  changePassword,
};