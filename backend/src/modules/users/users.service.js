const crypto = require('crypto');
const argon2 = require('argon2');

const usersRepository = require('./users.repository');
const { pool } = require('../../config/database');

const CREATION_HIERARCHY = {
  OWNER: ['SUPERADMIN'],
  SUPERADMIN: ['REGIONAL_ADMIN', 'AGENT', 'CUSTOMER'],
  REGIONAL_ADMIN: ['AGENT', 'CUSTOMER'],
  AGENT: ['CUSTOMER'],
  CUSTOMER: [],
};

function generateTemporaryPassword() {
  return crypto.randomBytes(9).toString('base64url');
}

async function getCreatorRoles(userId) {
  const result = await pool.query(
    `
      SELECT r.name
      FROM user_roles ur
      INNER JOIN roles r
        ON r.id = ur.role_id
      WHERE ur.user_id = $1
        AND ur.status = 'ACTIVE'
        AND ur.effective_from <= NOW()
        AND (
          ur.effective_until IS NULL
          OR ur.effective_until > NOW()
        )
      ORDER BY r.name
    `,
    [userId]
  );

  return result.rows.map((row) => row.name);
}

async function hasPermission(userId, permissionName) {
  const result = await pool.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM user_roles ur
        INNER JOIN role_permissions rp
          ON rp.role_id = ur.role_id
        INNER JOIN permissions p
          ON p.id = rp.permission_id
        WHERE ur.user_id = $1
          AND ur.status = 'ACTIVE'
          AND ur.effective_from <= NOW()
          AND (
            ur.effective_until IS NULL
            OR ur.effective_until > NOW()
          )
          AND p.name = $2
      ) AS allowed
    `,
    [userId, permissionName]
  );

  return result.rows[0].allowed;
}

async function createUser({
  creatorUserId,
  companyId,
  payload,
}) {
  const allowed = await hasPermission(
    creatorUserId,
    'user.create'
  );

  if (!allowed) {
    const error = new Error(
      'You do not have permission to create users'
    );

    error.statusCode = 403;
    error.code = 'PERMISSION_DENIED';

    throw error;
  }

  const roleName = String(payload.roleName).trim().toUpperCase();

  const creatorRoles = await getCreatorRoles(creatorUserId);

  if (creatorRoles.length === 0) {
    const error = new Error(
      'Authenticated user has no active role'
    );

    error.statusCode = 403;
    error.code = 'NO_ACTIVE_ROLE';

    throw error;
  }

  const canCreateRole = creatorRoles.some((creatorRole) =>
    (CREATION_HIERARCHY[creatorRole] || []).includes(roleName)
  );

  if (!canCreateRole) {
    const error = new Error(
      `Your role cannot create a ${roleName} account`
    );

    error.statusCode = 403;
    error.code = 'ROLE_CREATION_NOT_ALLOWED';

    throw error;
  }

  const targetRole = await usersRepository.getRoleByName(roleName);

  if (!targetRole) {
    const error = new Error(
      `Role not found: ${roleName}`
    );

    error.statusCode = 400;
    error.code = 'ROLE_NOT_FOUND';

    throw error;
  }

  const existingUser =
    await usersRepository.findUserByEmailOrPhone({
      companyId,
      email: payload.email,
      phone: payload.phone,
    });

  if (existingUser) {
    const error = new Error(
      'A user with the supplied email or phone already exists'
    );

    error.statusCode = 409;
    error.code = 'USER_ALREADY_EXISTS';

    throw error;
  }

  const temporaryPassword = generateTemporaryPassword();

  const temporaryPasswordHash = await argon2.hash(
    temporaryPassword
  );

  const userNumber =
    await usersRepository.generateNextUserNumber(
      companyId
    );

  const result =
    await usersRepository.createUserTransaction({
      companyId,
      creatorUserId,
      roleName,
      phone: String(payload.phone).trim(),
      email: payload.email
        ? String(payload.email).trim().toLowerCase()
        : null,
      temporaryPasswordHash,
      userNumber,
      status: 'PENDING',
      mustChangePassword: true,

      profile: {
        firstName: String(payload.firstName).trim(),
        middleName: payload.middleName
          ? String(payload.middleName).trim()
          : null,
        lastName: String(payload.lastName).trim(),
        dateOfBirth: payload.dateOfBirth || null,
        gender: payload.gender || null,
        nationalId: payload.nationalId || null,
        county: payload.county || null,
        subCounty: payload.subCounty || null,
        town: payload.town || null,
        area: payload.area || null,
        residentialAddress:
          payload.residentialAddress || null,
        landmark: payload.landmark || null,
        serviceLocation:
          payload.serviceLocation || null,
      },

      nextOfKin: {
        fullName: String(
          payload.nextOfKin.fullName
        ).trim(),
        relationship: String(
          payload.nextOfKin.relationship
        ).trim(),
        phone: String(
          payload.nextOfKin.phone
        ).trim(),
        email: payload.nextOfKin.email
          ? String(
              payload.nextOfKin.email
            ).trim().toLowerCase()
          : null,
        nationalId:
          payload.nextOfKin.nationalId || null,
        county: payload.nextOfKin.county || null,
        subCounty:
          payload.nextOfKin.subCounty || null,
        town: payload.nextOfKin.town || null,
        area: payload.nextOfKin.area || null,
        residentialAddress:
          payload.nextOfKin.residentialAddress ||
          null,
        landmark:
          payload.nextOfKin.landmark || null,
      },

      assignment: payload.assignment || null,
    });

  return {
    user: result.user,
    profile: result.profile,
    nextOfKin: result.nextOfKin,
    role: result.role,
    assignment: result.assignment,
    approval: result.approval,

    // Returned once so the creator can issue credentials.
    temporaryCredentials: {
      userNumber: result.user.user_number,
      temporaryPassword,
      mustChangePassword: true,
    },
  };
}

async function approveUser({
  approverUserId,
  companyId,
  userId,
  reason,
  notes,
}) {
  const allowed = await hasPermission(
    approverUserId,
    'user.approve'
  );

  if (!allowed) {
    const error = new Error(
      'You do not have permission to approve users'
    );

    error.statusCode = 403;
    error.code = 'PERMISSION_DENIED';

    throw error;
  }

  const targetUser = await usersRepository.findUserById({
    companyId,
    userId,
  });

  if (!targetUser) {
    const error = new Error('User not found');

    error.statusCode = 404;
    error.code = 'USER_NOT_FOUND';

    throw error;
  }

  if (
    targetUser.status !== 'PENDING' &&
    targetUser.status !== 'UNDER_REVIEW'
  ) {
    const error = new Error(
      `User cannot be approved from status ${targetUser.status}`
    );

    error.statusCode = 409;
    error.code = 'INVALID_USER_STATUS';

    throw error;
  }

  const targetRoles =
    await usersRepository.getUserRolesAndPermissions(
      userId
    );

  const roleNames = [
    ...new Set(
      targetRoles.map((role) => role.role_name)
    ),
  ];

  const approverRoles = await getCreatorRoles(
    approverUserId
  );

  const canApproveTarget =
    approverRoles.includes('OWNER') ||
    (
      approverRoles.includes('SUPERADMIN') &&
      !roleNames.includes('SUPERADMIN') &&
      !roleNames.includes('OWNER')
    );

  if (!canApproveTarget) {
    const error = new Error(
      'Your role cannot approve this user account'
    );

    error.statusCode = 403;
    error.code = 'ROLE_APPROVAL_NOT_ALLOWED';

    throw error;
  }

  const result =
    await usersRepository.approveUserTransaction({
      companyId,
      userId,
      approverUserId,
      reason,
      notes,
    });

  return result;
}

async function resetUserPassword({
  approverUserId,
  companyId,
  userId,
}) {
  const allowed = await hasPermission(
    approverUserId,
    'user.activate'
  );

  if (!allowed) {
    const error = new Error(
      'You do not have permission to reset user passwords'
    );

    error.statusCode = 403;
    throw error;
  }

  const targetUser = await usersRepository.findUserById({
    companyId,
    userId,
  });

  if (!targetUser) {
    const error = new Error('User not found');

    error.statusCode = 404;
    throw error;
  }

  const temporaryPassword = crypto
    .randomBytes(12)
    .toString('base64url');

  const passwordHash = await argon2.hash(
    temporaryPassword
  );

  const updatedUser =
    await usersRepository.resetUserPassword({
      companyId,
      userId,
      passwordHash,
    });

  if (!updatedUser) {
    const error = new Error('Failed to reset user password');

    error.statusCode = 500;
    throw error;
  }

  return {
    user: updatedUser,
    temporaryPassword,
  };
}

async function assignUser({
  assignerUserId,
  companyId,
  userId,
  payload,
}) {
  const allowed = await hasPermission(
    assignerUserId,
    'user.assign'
  );

  if (!allowed) {
    const error = new Error(
      'You do not have permission to assign users'
    );

    error.statusCode = 403;
    error.code = 'PERMISSION_DENIED';

    throw error;
  }

  const targetUser =
    await usersRepository.findUserById({
      companyId,
      userId,
    });

  if (!targetUser) {
    const error = new Error('User not found');

    error.statusCode = 404;
    error.code = 'USER_NOT_FOUND';

    throw error;
  }

  const assignmentType = String(
    payload.assignmentType
  ).trim().toUpperCase();

  const allowedAssignmentTypes = [
    'REGIONAL_ADMIN',
    'AGENT',
    'CUSTOMER_SERVICE',
    'OTHER',
  ];

  if (!allowedAssignmentTypes.includes(assignmentType)) {
    const error = new Error(
      `assignmentType must be one of: ${allowedAssignmentTypes.join(', ')}`
    );

    error.statusCode = 400;
    error.code = 'INVALID_ASSIGNMENT_TYPE';

    throw error;
  }

  const result =
    await usersRepository.createUserAssignmentTransaction({
      companyId,
      userId,
      assignedBy: assignerUserId,
      regionId: payload.regionId,
      locationId: payload.locationId,
      supervisorUserId: payload.supervisorUserId,
      assignmentType,
      effectiveFrom: payload.effectiveFrom,
      effectiveUntil: payload.effectiveUntil,
      reason: payload.reason,
    });

  return result;
}

module.exports = {
  createUser,
  approveUser,
  resetUserPassword,
  assignUser,
};