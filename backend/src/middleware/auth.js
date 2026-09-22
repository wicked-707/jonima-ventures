const authService = require('../modules/auth/auth.service');
const authRepository = require('../modules/auth/auth.repository');

async function authenticate(req, res, next) {
  try {
    const authorization = req.get('authorization');

    if (!authorization) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const [scheme, token] = authorization.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({
        success: false,
        message: 'Invalid authorization header',
      });
    }

    let payload;

    try {
      payload = authService.verifyAccessToken(token);
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired access token',
      });
    }

    if (!payload.sub || !payload.sid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid access token',
      });
    }

    const session = await authRepository.findActiveSession(
      payload.sid
    );

    if (!session) {
      return res.status(401).json({
        success: false,
        message: 'Session is invalid, revoked, or expired',
      });
    }

    if (session.user_id !== payload.sub) {
      return res.status(401).json({
        success: false,
        message: 'Session does not match authenticated user',
      });
    }

    req.auth = {
      userId: session.user_id,
      companyId: session.company_id,
      sessionId: session.id,
      userNumber: session.user_number,
      email: session.email,
      phone: session.phone,
      status: session.status,
      mustChangePassword: session.must_change_password,
    };

    next();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  authenticate,
};