const { pool } = require('../../config/database');

async function createUserTransaction({
  companyId,
  creatorUserId,
  roleName,
  phone,
  email,
  temporaryPasswordHash,
  userNumber,
  status = 'PENDING',
  mustChangePassword = true,
  profile,
  nextOfKin,
  assignment,
}) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Resolve role
    const roleResult = await client.query(
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

    if (roleResult.rows.length === 0) {
      throw new Error(`Role not found: ${roleName}`);
    }

    const role = roleResult.rows[0];

    // 2. Create user
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
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
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
        status,
        mustChangePassword,
        creatorUserId,
      ]
    );

    const user = userResult.rows[0];

    // 3. Create user profile
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

    // 4. Create next of kin
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

    // 5. Assign role
    const userRoleResult = await client.query(
      `
        INSERT INTO user_roles (
          user_id,
          role_id,
          assigned_by,
          effective_from,
          status
        )
        VALUES ($1, $2, $3, NOW(), 'ACTIVE')
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

    // 6. Create organizational assignment when supplied
    let assignmentRecord = null;

    if (assignment) {
      const assignmentResult = await client.query(
        `
          INSERT INTO user_assignments (
            user_id,
            region_id,
            location_id,
            supervisor_user_id,
            assigned_by,
            assignment_type,
            status,
            effective_from,
            effective_until,
            reason
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, 'ACTIVE',
            COALESCE($7, NOW()),
            $8,
            $9
          )
          RETURNING *
        `,
        [
          user.id,
          assignment.regionId || null,
          assignment.locationId || null,
          assignment.supervisorUserId || null,
          creatorUserId,
          assignment.assignmentType,
          assignment.effectiveFrom || null,
          assignment.effectiveUntil || null,
          assignment.reason || null,
        ]
      );

      assignmentRecord = assignmentResult.rows[0];
    }

    // 7. Create approval request
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
          'USER',
          $1,
          'REQUESTED',
          $2,
          $3,
          $4
        )
        RETURNING *
      `,
      [
        user.id,
        creatorUserId,
        'ACCOUNT_CREATION',
        `User account created with role ${role.name}`,
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
      assignment: assignmentRecord,
      approval: approvalResult.rows[0],
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

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
        description,
        is_system_role
      FROM roles
      WHERE name = $1
      LIMIT 1
    `,
    [roleName]
  );

  return result.rows[0] || null;
}

async function generateNextUserNumber(companyId) {
  const result = await pool.query(
    `
      SELECT next_business_number(
        $1,
        'USER',
        'JV-USR-'
      ) AS user_number
    `,
    [companyId]
  );

  return result.rows[0].user_number;
}

async function findUserById({
  companyId,
  userId,
}) {
  const result = await pool.query(
    `
      SELECT
        u.id,
        u.company_id,
        u.user_number,
        u.email,
        u.phone,
        u.status,
        u.must_change_password,
        u.created_by,
        u.approved_by,
        u.created_at,
        u.approved_at,
        u.updated_at
      FROM users u
      WHERE u.id = $1
        AND u.company_id = $2
      LIMIT 1
    `,
    [userId, companyId]
  );

  return result.rows[0] || null;
}

async function approveUserTransaction({
  companyId,
  userId,
  approverUserId,
  reason,
  notes,
}) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const userResult = await client.query(
      `
        SELECT
          id,
          company_id,
          user_number,
          email,
          phone,
          status,
          must_change_password
        FROM users
        WHERE id = $1
          AND company_id = $2
        FOR UPDATE
      `,
      [userId, companyId]
    );

    const user = userResult.rows[0];

    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      error.code = 'USER_NOT_FOUND';
      throw error;
    }

    if (
      user.status !== 'PENDING' &&
      user.status !== 'UNDER_REVIEW'
    ) {
      const error = new Error(
        `User cannot be approved from status ${user.status}`
      );

      error.statusCode = 409;
      error.code = 'INVALID_USER_STATUS';
      throw error;
    }

    const updateResult = await client.query(
      `
        UPDATE users
        SET
          status = 'APPROVED',
          approved_by = $2,
          approved_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
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
          created_at,
          approved_at,
          updated_at
      `,
      [userId, approverUserId]
    );

    const approvalResult = await client.query(
      `
        INSERT INTO approval_records (
          entity_type,
          entity_id,
          decision,
          decided_by,
          reason,
          notes,
          decided_at
        )
        VALUES (
          'USER',
          $1,
          'APPROVED',
          $2,
          $3,
          $4,
          NOW()
        )
        RETURNING
          id,
          entity_type,
          entity_id,
          decision,
          decided_by,
          reason,
          notes,
          decided_at
      `,
      [
        userId,
        approverUserId,
        reason || 'ACCOUNT_APPROVAL',
        notes || 'User account approved',
      ]
    );

    await client.query('COMMIT');

    return {
      user: updateResult.rows[0],
      approval: approvalResult.rows[0],
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getUserRolesAndPermissions(userId) {
  const result = await pool.query(
    `
      SELECT
        r.id AS role_id,
        r.name AS role_name,
        r.description AS role_description,
        p.id AS permission_id,
        p.name AS permission_name,
        p.description AS permission_description
      FROM user_roles ur
      INNER JOIN roles r
        ON r.id = ur.role_id
      LEFT JOIN role_permissions rp
        ON rp.role_id = r.id
      LEFT JOIN permissions p
        ON p.id = rp.permission_id
      WHERE ur.user_id = $1
        AND ur.status = 'ACTIVE'
        AND ur.effective_from <= NOW()
        AND (
          ur.effective_until IS NULL
          OR ur.effective_until > NOW()
        )
      ORDER BY r.name, p.name
    `,
    [userId]
  );

  return result.rows;
}

async function resetUserPassword({
  companyId,
  userId,
  passwordHash,
}) {
  const result = await pool.query(
    `
      UPDATE users
      SET
        password_hash = $1,
        must_change_password = TRUE,
        updated_at = NOW()
      WHERE id = $2
        AND company_id = $3
      RETURNING
        id,
        user_number,
        status,
        must_change_password,
        updated_at
    `,
    [passwordHash, userId, companyId]
  );

  return result.rows[0] || null;
}

module.exports = {
  createUserTransaction,
  findUserByEmailOrPhone,
  getRoleByName,
  generateNextUserNumber,
  findUserById,
  approveUserTransaction,
  getUserRolesAndPermissions,
  resetUserPassword,
};
