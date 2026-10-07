const crypto = require('crypto');
const argon2 = require('argon2');

const customersRepository = require('./customers.repository');
const { pool } = require('../../config/database');

async function getUserRoles(userId) {
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

function generateTemporaryPassword() {
  return crypto.randomBytes(9).toString('base64url');
}

async function createCustomer({
  creatorUserId,
  companyId,
  payload,
}) {
  const allowed = await hasPermission(
    creatorUserId,
    'customer.create'
  );

  if (!allowed) {
    const error = new Error(
      'You do not have permission to create customers'
    );

    error.statusCode = 403;
    error.code = 'PERMISSION_DENIED';

    throw error;
  }

  const creatorRoles = await getUserRoles(
    creatorUserId
  );

  const allowedCreatorRoles = [
    'AGENT',
    'REGIONAL_ADMIN',
    'SUPERADMIN',
  ];

  const creatorRole = creatorRoles.find((role) =>
    allowedCreatorRoles.includes(role)
  );

  if (!creatorRole) {
    const error = new Error(
      'Your role cannot create customers'
    );

    error.statusCode = 403;
    error.code = 'CUSTOMER_CREATION_NOT_ALLOWED';

    throw error;
  }

  const phone = String(payload.phone).trim();

  const email = payload.email
    ? String(payload.email).trim().toLowerCase()
    : null;

  const existingUser =
    await customersRepository.findUserByEmailOrPhone({
      companyId,
      email,
      phone,
    });

  if (existingUser) {
    const error = new Error(
      'A user with the supplied email or phone already exists'
    );

    error.statusCode = 409;
    error.code = 'USER_ALREADY_EXISTS';

    throw error;
  }

  let agentUserId = null;
  let regionId = String(payload.regionId).trim();

  if (creatorRole === 'AGENT') {
    const agentAssignment =
      await customersRepository.getActiveAgentAssignment({
        companyId,
        agentUserId: creatorUserId,
      });

    if (!agentAssignment) {
      const error = new Error(
        'Agent must have an active regional assignment before creating customers'
      );

      error.statusCode = 403;
      error.code = 'AGENT_ASSIGNMENT_REQUIRED';

      throw error;
    }

    if (agentAssignment.region_id !== regionId) {
      const error = new Error(
        'Agent can only create customers within their assigned region'
      );

      error.statusCode = 403;
      error.code = 'REGION_ASSIGNMENT_MISMATCH';

      throw error;
    }

    agentUserId = creatorUserId;
  } else {
    agentUserId =
      payload.agentUserId
        ? String(payload.agentUserId).trim()
        : null;
  }

  if (
    (creatorRole === 'REGIONAL_ADMIN' ||
      creatorRole === 'SUPERADMIN') &&
    !agentUserId
  ) {
    const error = new Error(
      'agentUserId is required when creating a customer from this role'
    );

    error.statusCode = 400;
    error.code = 'AGENT_REQUIRED';

    throw error;
  }

  const temporaryPassword =
    generateTemporaryPassword();

  const temporaryPasswordHash =
    await argon2.hash(temporaryPassword);

  const result =
    await customersRepository.createCustomerTransaction({
      companyId,
      creatorUserId,
      temporaryPasswordHash,
      phone,
      email,

      profile: {
        firstName: String(payload.firstName).trim(),
        middleName: payload.middleName
          ? String(payload.middleName).trim()
          : null,
        lastName: String(payload.lastName).trim(),
        dateOfBirth: payload.dateOfBirth || null,
        gender: payload.gender || null,
        nationalId: payload.nationalId
          ? String(payload.nationalId).trim()
          : null,
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

      regionId,
      agentUserId,
    });

  return {
    ...result,

    temporaryCredentials: {
      userNumber: result.user.user_number,
      temporaryPassword,
      mustChangePassword: true,
    },
  };
}

async function approveCustomer({
  approverUserId,
  companyId,
  customerId,
  reason,
  notes,
}) {
  const allowed = await hasPermission(
    approverUserId,
    'customer.approve'
  );

  if (!allowed) {
    const error = new Error(
      'You do not have permission to approve customers'
    );

    error.statusCode = 403;
    error.code = 'PERMISSION_DENIED';

    throw error;
  }

  const targetCustomer =
    await customersRepository.findCustomerById({
      companyId,
      customerId,
    });

  if (!targetCustomer) {
    const error = new Error('Customer not found');

    error.statusCode = 404;
    error.code = 'CUSTOMER_NOT_FOUND';

    throw error;
  }

  if (
    targetCustomer.status !== 'PENDING' &&
    targetCustomer.status !== 'UNDER_REVIEW'
  ) {
    const error = new Error(
      `Customer cannot be approved from status ${targetCustomer.status}`
    );

    error.statusCode = 409;
    error.code = 'INVALID_CUSTOMER_STATUS';

    throw error;
  }

  const approverRoles = await getUserRoles(
    approverUserId
  );

  const canApprove =
    approverRoles.includes('OWNER') ||
    approverRoles.includes('SUPERADMIN');

  if (!canApprove) {
    const error = new Error(
      'Your role cannot approve customers'
    );

    error.statusCode = 403;
    error.code = 'ROLE_APPROVAL_NOT_ALLOWED';

    throw error;
  }

  return customersRepository.approveCustomerTransaction({
    companyId,
    customerId,
    approverUserId,
    reason,
    notes,
  });
}

module.exports = {
  createCustomer,
  approveCustomer,
};


