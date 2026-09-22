function validateLoginPayload(body) {
  const identifier = String(body?.identifier || '').trim();
  const password = String(body?.password || '');

  const errors = {};

  if (!identifier) {
    errors.identifier = 'Email, phone, or user number is required';
  }

  if (!password) {
    errors.password = 'Password is required';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    data: {
      identifier,
      password,
    },
  };
}

function validateChangePasswordPayload(body = {}) {
  const errors = [];

  if (
    body.currentPassword === undefined ||
    body.currentPassword === null ||
    body.currentPassword === ''
  ) {
    errors.push('currentPassword is required');
  }

  if (
    body.newPassword === undefined ||
    body.newPassword === null ||
    body.newPassword === ''
  ) {
    errors.push('newPassword is required');
  }

  if (
    body.newPassword !== undefined &&
    body.newPassword !== null &&
    body.newPassword !== '' &&
    String(body.newPassword).length < 8
  ) {
    errors.push(
      'newPassword must be at least 8 characters long'
    );
  }

  if (
    body.currentPassword &&
    body.newPassword &&
    body.currentPassword === body.newPassword
  ) {
    errors.push(
      'newPassword must be different from currentPassword'
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

module.exports = {
  validateLoginPayload,
  validateChangePasswordPayload,
};