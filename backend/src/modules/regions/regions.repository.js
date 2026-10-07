const { pool } = require('../../config/database');

async function findById({ companyId, regionId }) {
  const result = await pool.query(
    `
      SELECT
        id,
        company_id,
        name,
        code,
        description,
        primary_location,
        status,
        created_by,
        created_at,
        updated_at
      FROM regions
      WHERE company_id = $1
        AND id = $2
      LIMIT 1
    `,
    [companyId, regionId]
  );

  return result.rows[0] || null;
}

async function list({ companyId, status }) {
  const values = [companyId];
  let statusClause = '';

  if (status) {
    values.push(status);
    statusClause = `AND status = $${values.length}`;
  }

  const result = await pool.query(
    `
      SELECT
        id,
        company_id,
        name,
        code,
        description,
        primary_location,
        status,
        created_by,
        created_at,
        updated_at
      FROM regions
      WHERE company_id = $1
        ${statusClause}
      ORDER BY name ASC
    `,
    values
  );

  return result.rows;
}

async function findByNameOrCode({ companyId, name, code }) {
  const result = await pool.query(
    `
      SELECT
        id,
        company_id,
        name,
        code,
        status
      FROM regions
      WHERE company_id = $1
        AND (
          LOWER(name) = LOWER($2)
          OR LOWER(code) = LOWER($3)
        )
      LIMIT 1
    `,
    [companyId, name, code]
  );

  return result.rows[0] || null;
}

async function create({
  companyId,
  name,
  code,
  description,
  primaryLocation,
  status,
  createdBy,
}) {
  const result = await pool.query(
    `
      INSERT INTO regions (
        company_id,
        name,
        code,
        description,
        primary_location,
        status,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING
        id,
        company_id,
        name,
        code,
        description,
        primary_location,
        status,
        created_by,
        created_at,
        updated_at
    `,
    [
      companyId,
      name,
      code,
      description || null,
      primaryLocation || null,
      status || 'PLANNED',
      createdBy,
    ]
  );

  return result.rows[0];
}

async function update({
  companyId,
  regionId,
  name,
  code,
  description,
  primaryLocation,
  status,
}) {
  const result = await pool.query(
    `
      UPDATE regions
      SET
        name = $3,
        code = $4,
        description = $5,
        primary_location = $6,
        status = $7,
        updated_at = NOW()
      WHERE company_id = $1
        AND id = $2
      RETURNING
        id,
        company_id,
        name,
        code,
        description,
        primary_location,
        status,
        created_by,
        created_at,
        updated_at
    `,
    [
      companyId,
      regionId,
      name,
      code,
      description || null,
      primaryLocation || null,
      status,
    ]
  );

  return result.rows[0] || null;
}

module.exports = {
  findById,
  list,
  findByNameOrCode,
  create,
  update,
};
