function validateCreateUserPayload(body = {}) {
  const errors = [];

  const requiredFields = [
    'roleName',
    'phone',
    'firstName',
    'lastName',
    'nextOfKin',
  ];

  for (const field of requiredFields) {
    if (
      body[field] === undefined ||
      body[field] === null ||
      body[field] === ''
    ) {
      errors.push(`${field} is required`);
    }
  }

  if (body.email !== undefined && body.email !== null && body.email !== '') {
    const email = String(body.email).trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push('email must be a valid email address');
    }
  }

  if (body.phone !== undefined && body.phone !== null) {
    const phone = String(body.phone).trim();

    if (!/^\+?[1-9]\d{7,14}$/.test(phone)) {
      errors.push('phone must be a valid international phone number');
    }
  }

  if (body.roleName !== undefined) {
    const allowedRoles = [
      'SUPERADMIN',
      'REGIONAL_ADMIN',
      'AGENT',
      'CUSTOMER',
    ];

    if (!allowedRoles.includes(String(body.roleName).toUpperCase())) {
      errors.push(
        `roleName must be one of: ${allowedRoles.join(', ')}`
      );
    }
  }

  if (body.status !== undefined) {
    const allowedStatuses = [
      'PENDING',
      'UNDER_REVIEW',
      'APPROVED',
      'ACTIVE',
      'SUSPENDED',
      'INACTIVE',
      'REJECTED',
    ];

    if (!allowedStatuses.includes(String(body.status).toUpperCase())) {
      errors.push(
        `status must be one of: ${allowedStatuses.join(', ')}`
      );
    }
  }

  if (body.nextOfKin && typeof body.nextOfKin !== 'object') {
    errors.push('nextOfKin must be an object');
  }

  if (body.nextOfKin && typeof body.nextOfKin === 'object') {
    const requiredNextOfKinFields = [
      'fullName',
      'relationship',
      'phone',
    ];

    for (const field of requiredNextOfKinFields) {
      if (
        body.nextOfKin[field] === undefined ||
        body.nextOfKin[field] === null ||
        body.nextOfKin[field] === ''
      ) {
        errors.push(`nextOfKin.${field} is required`);
      }
    }

    if (
      body.nextOfKin.email !== undefined &&
      body.nextOfKin.email !== null &&
      body.nextOfKin.email !== ''
    ) {
      if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
          String(body.nextOfKin.email).trim()
        )
      ) {
        errors.push('nextOfKin.email must be a valid email address');
      }
    }
  }

  if (
    body.documents !== undefined &&
    body.documents !== null &&
    !Array.isArray(body.documents)
  ) {
    errors.push('documents must be an array');
  }

  if (
    body.nextOfKinDocuments !== undefined &&
    body.nextOfKinDocuments !== null &&
    !Array.isArray(body.nextOfKinDocuments)
  ) {
    errors.push('nextOfKinDocuments must be an array');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

module.exports = {
  validateCreateUserPayload,
};
