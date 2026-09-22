const crypto = require('crypto');
const argon2 = require('argon2');
const jwt = require('jsonwebtoken');

const authRepository = require('./auth.repository');

const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || '15m';
const REFRESH_TOKEN_DAYS = Number(process.env.REFRESH_TOKEN_DAYS || 30);

function getJwtSecret() {
  if (!process.env.JWT_ACCESS_SECRET) {
    throw new Error('JWT_ACCESS_SECRET is not configured');
  }

  return process.env.JWT_ACCESS_SECRET;
}

function normalizeIdentifier(identifier) {
  return String(identifier || '').trim();
}

function generateRefreshToken() {
  return crypto.randomBytes(64).toString('hex');
}

function hashRefreshToken(refreshToken) {
  return crypto
    .createHash('sha256')
    .update(refreshToken)
    .digest('hex');
}

function calculateRefreshExpiry() {
  const expiresAt = new Date();

  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_DAYS);

  return expiresAt;
}

function createAccessToken({ user, sessionId, roles }) {
  return jwt.sign(
    {
      sub: user.id,
      sid: sessionId,
      companyId: user.company_id,
      roles,
    },
    getJwtSecret(),
    {
      expiresIn: ACCESS_TOKEN_TTL,
      issuer: 'jonima-ventures-api',
      audience: 'jonima-ventures-client',
    }
  );
}

function buildAuthorizationData(roleRows) {
  const roles = [];
  const permissions = new Set();

  for (const row of roleRows) {
    if (!roles.includes(row.role_name)) {
      roles.push(row.role_name);
    }

    if (row.permission_name) {
      permissions.add(row.permission_name);
    }
  }

  return {
    roles,
    permissions: [...permissions].sort(),
  };
}

function isLoginAllowed(status) {
  return status === 'APPROVED' || status === 'ACTIVE';
}

async function login({
  identifier,
  password,
  ipAddress,
  userAgent,
  deviceLabel,
}) {
  const normalizedIdentifier = normalizeIdentifier(identifier);

  if (!normalizedIdentifier) {
    throw new Error('Login identifier is required');
  }

  if (!password) {
    throw new Error('Password is required');
  }

  const user = await authRepository.findUserByIdentifier(
    normalizedIdentifier
  );

  if (!user) {
    await authRepository.recordLoginAttempt({
      loginIdentifier: normalizedIdentifier,
      ipAddress,
      userAgent,
      success: false,
      failureReason: 'INVALID_CREDENTIALS',
    });

    throw new Error('Invalid login credentials');
  }

  let passwordValid = false;

  try {
    passwordValid = await argon2.verify(
      user.password_hash,
      password
    );
  } catch (error) {
    passwordValid = false;
  }

  if (!passwordValid) {
    await authRepository.recordLoginAttempt({
      userId: user.id,
      loginIdentifier: normalizedIdentifier,
      ipAddress,
      userAgent,
      success: false,
      failureReason: 'INVALID_CREDENTIALS',
    });

    throw new Error('Invalid login credentials');
  }

  if (!isLoginAllowed(user.status)) {
    await authRepository.recordLoginAttempt({
      userId: user.id,
      loginIdentifier: normalizedIdentifier,
      ipAddress,
      userAgent,
      success: false,
      failureReason: `ACCOUNT_${user.status}`,
    });

    throw new Error(`Account cannot log in while status is ${user.status}`);
  }

  const roleRows = await authRepository.getUserRolesAndPermissions(
    user.id
  );

  const authorization = buildAuthorizationData(roleRows);

  if (authorization.roles.length === 0) {
    await authRepository.recordLoginAttempt({
      userId: user.id,
      loginIdentifier: normalizedIdentifier,
      ipAddress,
      userAgent,
      success: false,
      failureReason: 'NO_ACTIVE_ROLE',
    });

    throw new Error('Account has no active role');
  }

  const refreshToken = generateRefreshToken();
  const refreshTokenHash = hashRefreshToken(refreshToken);
  const refreshExpiresAt = calculateRefreshExpiry();

  const session = await authRepository.createSession({
    userId: user.id,
    refreshTokenHash,
    ipAddress,
    userAgent,
    deviceLabel,
    expiresAt: refreshExpiresAt,
  });

  const accessToken = createAccessToken({
    user,
    sessionId: session.id,
    roles: authorization.roles,
  });

  await authRepository.updateLastLogin(user.id);

  await authRepository.recordLoginAttempt({
    userId: user.id,
    loginIdentifier: normalizedIdentifier,
    ipAddress,
    userAgent,
    success: true,
  });

  const profile = await authRepository.getUserProfile(user.id);

  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_TTL,
    session: {
      id: session.id,
      expiresAt: session.expires_at,
    },
    user: {
      id: user.id,
      companyId: user.company_id,
      userNumber: user.user_number,
      email: user.email,
      phone: user.phone,
      status: user.status,
      mustChangePassword: user.must_change_password,
      profile,
      roles: authorization.roles,
      permissions: authorization.permissions,
    },
  };
}

async function getCurrentUser(sessionId) {
  if (!sessionId) {
    throw new Error('Session is required');
  }

  const session = await authRepository.findActiveSession(sessionId);

  if (!session) {
    throw new Error('Session is invalid or expired');
  }

  if (!isLoginAllowed(session.status)) {
    throw new Error('Account is not active');
  }

  const roleRows = await authRepository.getUserRolesAndPermissions(
    session.user_id
  );

  const authorization = buildAuthorizationData(roleRows);

  const profile = await authRepository.getUserProfile(
    session.user_id
  );

  return {
    user: {
      id: session.user_id,
      companyId: session.company_id,
      userNumber: session.user_number,
      email: session.email,
      phone: session.phone,
      status: session.status,
      mustChangePassword: session.must_change_password,
      profile,
      roles: authorization.roles,
      permissions: authorization.permissions,
    },
    session: {
      id: session.id,
      expiresAt: session.expires_at,
      lastActivityAt: session.last_activity_at,
    },
  };
}

async function logout(sessionId) {
  if (!sessionId) {
    return {
      success: true,
    };
  }

  await authRepository.revokeSession(
    sessionId,
    'LOGOUT'
  );

  return {
    success: true,
  };
}

function verifyAccessToken(token) {
  return jwt.verify(token, getJwtSecret(), {
    issuer: 'jonima-ventures-api',
    audience: 'jonima-ventures-client',
  });
}

async function changePassword({
  userId,
  currentPassword,
  newPassword,
}) {
  if (!currentPassword || !newPassword) {
    const error = new Error(
      'Current password and new password are required'
    );

    error.statusCode = 400;
    error.code = 'PASSWORD_FIELDS_REQUIRED';

    throw error;
  }

  if (newPassword.length < 8) {
    const error = new Error(
      'New password must be at least 8 characters long'
    );

    error.statusCode = 400;
    error.code = 'WEAK_PASSWORD';

    throw error;
  }

  if (currentPassword === newPassword) {
    const error = new Error(
      'New password must be different from the current password'
    );

    error.statusCode = 400;
    error.code = 'PASSWORD_UNCHANGED';

    throw error;
  }

  const user =
  await authRepository.findUserById(userId);

  if (!user) {
    const error = new Error('User not found');

    error.statusCode = 404;
    error.code = 'USER_NOT_FOUND';

    throw error;
  }

  const validPassword = await argon2.verify(
    user.password_hash,
    currentPassword
  );

  if (!validPassword) {
    const error = new Error(
      'Current password is incorrect'
    );

    error.statusCode = 401;
    error.code = 'INVALID_CURRENT_PASSWORD';

    throw error;
  }

  const newPasswordHash = await argon2.hash(
    newPassword
  );

  const updatedUser =
    await authRepository.changePassword({
      userId: user.id,
      newPasswordHash,
    });

  if (!updatedUser) {
    const error = new Error(
      'Failed to update password'
    );

    error.statusCode = 500;
    error.code = 'PASSWORD_UPDATE_FAILED';

    throw error;
  }

  return updatedUser;
}

module.exports = {
  login,
  getCurrentUser,
  logout,
  verifyAccessToken,
  hashRefreshToken,
  changePassword,
};