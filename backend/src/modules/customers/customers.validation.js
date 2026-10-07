function validateCreateCustomerPayload(payload) {
  const errors = [];

  if (!payload || typeof payload !== 'object') {
    return ['Request body is required'];
  }

  const requiredFields = [
    'firstName',
    'lastName',
    'phone',
    'nationalId',
    'regionId',
    'nextOfKin',
  ];

  for (const field of requiredFields) {
    if (
      payload[field] === undefined ||
      payload[field] === null ||
      String(payload[field]).trim() === ''
    ) {
      errors.push(`${field} is required`);
    }
  }

  if (payload.email !== undefined && payload.email !== null) {
    const email = String(payload.email).trim();

    if (
      email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      errors.push('email must be a valid email address');
    }
  }

  if (
    payload.nextOfKin &&
    typeof payload.nextOfKin === 'object'
  ) {
    const nextOfKinRequired = [
      'fullName',
      'relationship',
      'phone',
    ];

    for (const field of nextOfKinRequired) {
      if (
        payload.nextOfKin[field] === undefined ||
        payload.nextOfKin[field] === null ||
        String(payload.nextOfKin[field]).trim() === ''
      ) {
        errors.push(`nextOfKin.${field} is required`);
      }
    }

    if (
      payload.nextOfKin.email !== undefined &&
      payload.nextOfKin.email !== null
    ) {
      const email = String(payload.nextOfKin.email).trim();

      if (
        email &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      ) {
        errors.push(
          'nextOfKin.email must be a valid email address'
        );
      }
    }
  }

  if (
    payload.dateOfBirth &&
    !/^\d{4}-\d{2}-\d{2}$/.test(
      String(payload.dateOfBirth)
    )
  ) {
    errors.push(
      'dateOfBirth must use YYYY-MM-DD format'
    );
  }

  if (
    payload.regionId &&
    typeof payload.regionId !== 'string'
  ) {
    errors.push('regionId must be a string');
  }

  return errors;
}

module.exports = {
  validateCreateCustomerPayload,
};
