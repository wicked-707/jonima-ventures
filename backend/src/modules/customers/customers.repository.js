const { pool } = require('../../config/database');

async function findUserByEmailOrPhone({
  companyId,
  email,
  phone,
}) {
  const result = await pool.query(
    `
      SELECT
        id,
        company_id,
        user_number,
        email,
        phone,
        status
      FROM users
      WHERE company_id = $1
        AND (
          (CAST($2 AS varchar) IS NOT NULL AND email = CAST($2 AS varchar))
          OR phone = $3
        )
      LIMIT 1
    `,
    [
      companyId,
      email || null,
      phone,
    ]
  );

  return result.rows[0] || null;
}

async function getRoleByName(roleName) {
  const result = await pool.query(
    `
      SELECT
        id,
        name,
        description
      FROM roles
      WHERE name = $1
      LIMIT 1
    `,
    [roleName]
  );

  return result.rows[0] || null;
}

async function getActiveAgentAssignment({
  companyId,
  agentUserId,
}) {
  const result = await pool.query(
    `
      SELECT
        ua.id,
        ua.user_id,
        ua.region_id,
        ua.location_id,
        ua.assignment_type,
        ua.status,
        ua.effective_from,
        ua.effective_until
      FROM user_assignments ua
      INNER JOIN users u
        ON u.id = ua.user_id
      WHERE ua.user_id = $1
        AND u.company_id = $2
        AND ua.assignment_type = 'AGENT'
        AND ua.status = 'ACTIVE'
        AND ua.effective_from <= NOW()
        AND (
          ua.effective_until IS NULL
          OR ua.effective_until > NOW()
        )
      ORDER BY ua.effective_from DESC
      LIMIT 1
    `,
    [agentUserId, companyId]
  );

  return result.rows[0] || null;
}

async function findCustomerById({
  companyId,
  customerId,
}) {
  const result = await pool.query(
    `
      SELECT
        c.id,
        c.company_id,
        c.customer_number,
        c.user_id,
        c.status,
        c.kyc_status,
        c.created_by,
        c.approved_by,
        c.approved_at,
        c.created_at,
        c.updated_at,
        u.user_number,
        u.email,
        u.phone,
        u.status AS user_status,
        u.must_change_password,
        p.first_name,
        p.middle_name,
        p.last_name
      FROM customers c
      INNER JOIN users u
        ON u.id = c.user_id
      INNER JOIN user_profiles p
        ON p.user_id = u.id
      WHERE c.id = $1
        AND c.company_id = $2
      LIMIT 1
    `,
    [customerId, companyId]
  );

  return result.rows[0] || null;
}

async function approveCustomerTransaction({
  companyId,
  customerId,
  approverUserId,
  reason,
  notes,
}) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const customerResult = await client.query(
      `
        SELECT
          c.id,
          c.company_id,
          c.customer_number,
          c.user_id,
          c.status,
          c.kyc_status,
          c.created_by,
          u.status AS user_status
        FROM customers c
        INNER JOIN users u
          ON u.id = c.user_id
        WHERE c.id = $1
          AND c.company_id = $2
        FOR UPDATE
      `,
      [customerId, companyId]
    );

    if (customerResult.rows.length === 0) {
      const error = new Error('Customer not found');
      error.statusCode = 404;
      error.code = 'CUSTOMER_NOT_FOUND';
      throw error;
    }

    const customer = customerResult.rows[0];

    if (
      customer.status !== 'PENDING' &&
      customer.status !== 'UNDER_REVIEW'
    ) {
      const error = new Error(
        `Customer cannot be approved from status ${customer.status}`
      );

      error.statusCode = 409;
      error.code = 'INVALID_CUSTOMER_STATUS';
      throw error;
    }

    if (
      customer.user_status !== 'PENDING' &&
      customer.user_status !== 'UNDER_REVIEW'
    ) {
      const error = new Error(
        `Customer user cannot be approved from status ${customer.user_status}`
      );

      error.statusCode = 409;
      error.code = 'INVALID_CUSTOMER_USER_STATUS';
      throw error;
    }

    const updatedCustomerResult = await client.query(
      `
        UPDATE customers
        SET
          status = 'APPROVED',
          approved_by = $1,
          approved_at = NOW()
        WHERE id = $2
          AND company_id = $3
        RETURNING *
      `,
      [
        approverUserId,
        customerId,
        companyId,
      ]
    );

    const updatedUserResult = await client.query(
      `
        UPDATE users
        SET
          status = 'APPROVED',
          approved_by = $1,
          approved_at = NOW()
        WHERE id = $2
          AND company_id = $3
        RETURNING
          id,
          company_id,
          user_number,
          email,
          phone,
          status,
          must_change_password,
          created_by,
          approved_by,
          approved_at,
          created_at,
          updated_at
      `,
      [
        approverUserId,
        customer.user_id,
        companyId,
      ]
    );

    const approvalResult = await client.query(
      `
        INSERT INTO approval_records (
          entity_type,
          entity_id,
          decision,
          decided_by,
          reason,
          notes
        )
        VALUES (
          'CUSTOMER',
          $1,
          'APPROVED',
          $2,
          $3,
          $4
        )
        RETURNING *
      `,
      [
        customerId,
        approverUserId,
        reason || 'CUSTOMER_APPROVAL',
        notes || `Customer ${customer.customer_number} approved`,
      ]
    );

    const historyResult = await client.query(
      `
        INSERT INTO customer_status_history (
          customer_id,
          old_status,
          new_status,
          reason,
          changed_by
        )
        VALUES (
          $1,
          $2,
          'APPROVED',
          $3,
          $4
        )
        RETURNING *
      `,
      [
        customerId,
        customer.status,
        reason || 'CUSTOMER_APPROVAL',
        approverUserId,
      ]
    );

    await client.query('COMMIT');

    return {
      customer: updatedCustomerResult.rows[0],
      user: updatedUserResult.rows[0],
      approval: approvalResult.rows[0],
      statusHistory: historyResult.rows[0],
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function createCustomerTransaction({
  companyId,
  creatorUserId,
  temporaryPasswordHash,
  phone,
  email,
  profile,
  nextOfKin,
  regionId,
  agentUserId,
}) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const roleResult = await client.query(
      `
        SELECT
          id,
          name,
          description
        FROM roles
        WHERE name = 'CUSTOMER'
        LIMIT 1
      `
    );

    if (roleResult.rows.length === 0) {
      const error = new Error('CUSTOMER role not found');
      error.statusCode = 500;
      error.code = 'CUSTOMER_ROLE_NOT_FOUND';
      throw error;
    }

    const role = roleResult.rows[0];

    const numberResult = await client.query(
      `
        SELECT next_business_number(
          $1,
          'USER',
          'JV-USR-'
        ) AS user_number
      `,
      [companyId]
    );

    const userNumber = numberResult.rows[0].user_number;

    const userResult = await client.query(
      `
        INSERT INTO users (
          company_id,
          user_number,
          email,
          phone,
          password_hash,
          status,
          must_change_password,
          created_by
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          'PENDING',
          TRUE,
          $6
        )
        RETURNING
          id,
          company_id,
          user_number,
          email,
          phone,
          status,
          must_change_password,
          created_by,
          created_at,
          updated_at
      `,
      [
        companyId,
        userNumber,
        email || null,
        phone,
        temporaryPasswordHash,
        creatorUserId,
      ]
    );

    const user = userResult.rows[0];

    const profileResult = await client.query(
      `
        INSERT INTO user_profiles (
          user_id,
          first_name,
          middle_name,
          last_name,
          date_of_birth,
          gender,
          national_id,
          county,
          sub_county,
          town,
          area,
          residential_address,
          landmark,
          service_location
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14
        )
        RETURNING *
      `,
      [
        user.id,
        profile.firstName,
        profile.middleName || null,
        profile.lastName,
        profile.dateOfBirth || null,
        profile.gender || null,
        profile.nationalId || null,
        profile.county || null,
        profile.subCounty || null,
        profile.town || null,
        profile.area || null,
        profile.residentialAddress || null,
        profile.landmark || null,
        profile.serviceLocation || null,
      ]
    );

    const nextOfKinResult = await client.query(
      `
        INSERT INTO next_of_kin (
          user_id,
          full_name,
          relationship,
          phone,
          email,
          national_id,
          county,
          sub_county,
          town,
          area,
          residential_address,
          landmark
        )
        VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12
        )
        RETURNING *
      `,
      [
        user.id,
        nextOfKin.fullName,
        nextOfKin.relationship,
        nextOfKin.phone,
        nextOfKin.email || null,
        nextOfKin.nationalId || null,
        nextOfKin.county || null,
        nextOfKin.subCounty || null,
        nextOfKin.town || null,
        nextOfKin.area || null,
        nextOfKin.residentialAddress || null,
        nextOfKin.landmark || null,
      ]
    );

    const userRoleResult = await client.query(
      `
        INSERT INTO user_roles (
          user_id,
          role_id,
          assigned_by,
          effective_from,
          status
        )
        VALUES (
          $1,
          $2,
          $3,
          NOW(),
          'ACTIVE'
        )
        RETURNING
          id,
          user_id,
          role_id,
          assigned_by,
          assigned_at,
          effective_from,
          effective_until,
          status
      `,
      [
        user.id,
        role.id,
        creatorUserId,
      ]
    );

    const customerNumberResult = await client.query(
      `
        SELECT next_business_number(
          $1,
          'CUSTOMER',
          'JV-CUS-'
        ) AS customer_number
      `,
      [companyId]
    );

    const customerNumber =
      customerNumberResult.rows[0].customer_number;

    const customerResult = await client.query(
      `
        INSERT INTO customers (
          company_id,
          customer_number,
          user_id,
          status,
          kyc_status,
          created_by
        )
        VALUES (
          $1,
          $2,
          $3,
          'PENDING',
          'PENDING',
          $4
        )
        RETURNING *
      `,
      [
        companyId,
        customerNumber,
        user.id,
        creatorUserId,
      ]
    );

    const customer = customerResult.rows[0];

    const assignmentResult = await client.query(
      `
        INSERT INTO customer_assignments (
          customer_id,
          region_id,
          agent_user_id,
          assigned_by,
          status,
          effective_from,
          reason
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          'ACTIVE',
          NOW(),
          $5
        )
        RETURNING *
      `,
      [
        customer.id,
        regionId,
        agentUserId,
        creatorUserId,
        'Initial customer assignment',
      ]
    );

    const approvalResult = await client.query(
      `
        INSERT INTO approval_records (
          entity_type,
          entity_id,
          decision,
          decided_by,
          reason,
          notes
        )
        VALUES (
          'CUSTOMER',
          $1,
          'REQUESTED',
          $2,
          $3,
          $4
        )
        RETURNING *
      `,
      [
        customer.id,
        creatorUserId,
        'CUSTOMER_CREATION',
        `Customer ${customerNumber} created`,
      ]
    );

    await client.query('COMMIT');

    return {
      user,
      profile: profileResult.rows[0],
      nextOfKin: nextOfKinResult.rows[0],
      role: {
        id: role.id,
        name: role.name,
        description: role.description,
        assignment: userRoleResult.rows[0],
      },
      customer,
      assignment: assignmentResult.rows[0],
      approval: approvalResult.rows[0],
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  findUserByEmailOrPhone,
  getRoleByName,
  getActiveAgentAssignment,
  findCustomerById,
  approveCustomerTransaction,
  createCustomerTransaction,
};
