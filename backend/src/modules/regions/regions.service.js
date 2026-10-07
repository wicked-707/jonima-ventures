const regionsRepository = require('./regions.repository');
const {
  validateCreateRegion,
  validateUpdateRegion,
  validateListRegions,
} = require('./regions.validation');

const VALID_STATUSES = [
  'PLANNED',
  'ACTIVE',
  'SUSPENDED',
  'CLOSED',
];

async function createRegion({ userId, companyId, payload }) {
  const data = validateCreateRegion(payload);

  const existing = await regionsRepository.findByNameOrCode({
    companyId,
    name: data.name,
    code: data.code,
  });

  if (existing) {
    const duplicateField =
      existing.name.toLowerCase() === data.name.toLowerCase()
        ? 'name'
        : 'code';

    const error = new Error(`Region ${duplicateField} already exists`);
    error.statusCode = 409;
    error.code = 'REGION_ALREADY_EXISTS';
    error.details = {
      field: duplicateField,
    };

    throw error;
  }

  return regionsRepository.create({
    companyId,
    name: data.name,
    code: data.code.toUpperCase(),
    description: data.description,
    primaryLocation: data.primaryLocation,
    status: data.status,
    createdBy: userId,
  });
}

async function listRegions({ companyId, query }) {
  const { status } = validateListRegions(query);

  return regionsRepository.list({
    companyId,
    status,
  });
}

async function getRegion({ companyId, regionId }) {
  const region = await regionsRepository.findById({
    companyId,
    regionId,
  });

  if (!region) {
    const error = new Error('Region not found');
    error.statusCode = 404;
    error.code = 'REGION_NOT_FOUND';
    throw error;
  }

  return region;
}

async function updateRegion({
  userId,
  companyId,
  regionId,
  payload,
}) {
  const data = validateUpdateRegion(payload);

  const existingRegion = await regionsRepository.findById({
    companyId,
    regionId,
  });

  if (!existingRegion) {
    const error = new Error('Region not found');
    error.statusCode = 404;
    error.code = 'REGION_NOT_FOUND';
    throw error;
  }

  const duplicate = await regionsRepository.findByNameOrCode({
    companyId,
    name: data.name,
    code: data.code,
  });

  if (duplicate && duplicate.id !== regionId) {
    const duplicateField =
      duplicate.name.toLowerCase() === data.name.toLowerCase()
        ? 'name'
        : 'code';

    const error = new Error(`Region ${duplicateField} already exists`);
    error.statusCode = 409;
    error.code = 'REGION_ALREADY_EXISTS';
    error.details = {
      field: duplicateField,
    };

    throw error;
  }

  return regionsRepository.update({
    companyId,
    regionId,
    name: data.name,
    code: data.code.toUpperCase(),
    description: data.description,
    primaryLocation: data.primaryLocation,
    status: data.status,
  });
}

module.exports = {
  createRegion,
  listRegions,
  getRegion,
  updateRegion,
  VALID_STATUSES,
};
