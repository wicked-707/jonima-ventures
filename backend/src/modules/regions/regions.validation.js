const REGION_STATUSES = [
  'PLANNED',
  'ACTIVE',
  'SUSPENDED',
  'CLOSED',
];

function normalizeString(value) {
  if (value === undefined || value === null) {
    return undefined;
  }

  const normalized = String(value).trim();

  return normalized === '' ? undefined : normalized;
}

function validateCreateRegion(body = {}) {
  const name = normalizeString(body.name);
  const code = normalizeString(body.code);
  const description = normalizeString(body.description);
  const primaryLocation = normalizeString(body.primaryLocation);
  const status = normalizeString(body.status)?.toUpperCase() || 'PLANNED';

  const errors = {};

  if (!name) {
    errors.name = 'Region name is required';
  }

  if (!code) {
    errors.code = 'Region code is required';
  }

  if (code && !/^[A-Za-z0-9_-]+$/.test(code)) {
    errors.code =
      'Region code may contain only letters, numbers, underscores, and hyphens';
  }

  if (!REGION_STATUSES.includes(status)) {
    errors.status = `Status must be one of: ${REGION_STATUSES.join(', ')}`;
  }

  if (Object.keys(errors).length > 0) {
    const error = new Error('Region validation failed');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    error.details = errors;
    throw error;
  }

  return {
    name,
    code,
    description,
    primaryLocation,
    status,
  };
}

function validateUpdateRegion(body = {}) {
  const name = normalizeString(body.name);
  const code = normalizeString(body.code);
  const description = normalizeString(body.description);
  const primaryLocation = normalizeString(body.primaryLocation);
  const status = normalizeString(body.status)?.toUpperCase();

  const errors = {};

  if (!name) {
    errors.name = 'Region name is required';
  }

  if (!code) {
    errors.code = 'Region code is required';
  }

  if (code && !/^[A-Za-z0-9_-]+$/.test(code)) {
    errors.code =
      'Region code may contain only letters, numbers, underscores, and hyphens';
  }

  if (!status) {
    errors.status = 'Region status is required';
  } else if (!REGION_STATUSES.includes(status)) {
    errors.status = `Status must be one of: ${REGION_STATUSES.join(', ')}`;
  }

  if (Object.keys(errors).length > 0) {
    const error = new Error('Region validation failed');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    error.details = errors;
    throw error;
  }

  return {
    name,
    code,
    description,
    primaryLocation,
    status,
  };
}

function validateListRegions(query = {}) {
  const status = normalizeString(query.status)?.toUpperCase();

  if (status && !REGION_STATUSES.includes(status)) {
    const error = new Error('Invalid region status');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    error.details = {
      status: `Status must be one of: ${REGION_STATUSES.join(', ')}`,
    };
    throw error;
  }

  return { status };
}

module.exports = {
  REGION_STATUSES,
  validateCreateRegion,
  validateUpdateRegion,
  validateListRegions,
};
