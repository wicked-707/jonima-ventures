const { pool } = require('../../config/database');

async function findUserByIdentifier(identifier) {
  const result = await pool.query(
    `
      SELECT
        u.id,
        u.company_id,
        u.user_number,
        u.email,
        u.phone,
        u.password_hash,
        u.status,
        u.must_change_password,
        u.last_login_at,
        u.created_at,
        u.approved_at
      FROM users u
      WHERE u.email::text = $1
         OR u.phone = $1
         OR u.user_number = $1
      LIMIT 1
    `,
    [identifier]
  );

  return result.rows[0] || null;
}

async function findUserById(userId) {
  const result = await pool.query(
    `
      SELECT
        id,
        company_id,
        user_number,
        email,
        phone,
        password_hash,
        status,
        must_change_password
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [userId]
  );

  return result.rows[0] || null;
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

async function getUserProfile(userId) {
  const result = await pool.query(
    `
      SELECT
        id,
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
        service_location,
        created_at,
        updated_at
      FROM user_profiles
      WHERE user_id = $1
      LIMIT 1
    `,
    [userId]
  );

  return result.rows[0] || null;
}

async function createSession({
  userId,
  refreshTokenHash,
  ipAddress,
  userAgent,
  deviceLabel,
  expiresAt,
}) {
  const result = await pool.query(
    `
      INSERT INTO sessions (
        user_id,
        refresh_token_hash,
        ip_address,
        user_agent,
        device_label,
        expires_at,
        last_activity_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING
        id,
        user_id,
        created_at,
        expires_at,
        last_activity_at
    `,
    [
      userId,
      refreshTokenHash,
      ipAddress || null,
      userAgent || null,
      deviceLabel || null,
      expiresAt,
    ]
  );

  return result.rows[0];
}

async function findActiveSession(sessionId) {
  const result = await pool.query(
    `
      SELECT
        s.id,
        s.user_id,
        s.expires_at,
        s.last_activity_at,
        s.revoked_at,
        u.company_id,
        u.user_number,
        u.email,
        u.phone,
        u.status,
        u.must_change_password
      FROM sessions s
      INNER JOIN users u
        ON u.id = s.user_id
      WHERE s.id = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > NOW()
      LIMIT 1
    `,
    [sessionId]
  );

  return result.rows[0] || null;
}

async function revokeSession(sessionId, reason = 'LOGOUT') {
  const result = await pool.query(
    `
      UPDATE sessions
      SET
        revoked_at = NOW(),
        revoke_reason = $2,
        last_activity_at = NOW()
      WHERE id = $1
        AND revoked_at IS NULL
      RETURNING
        id,
        revoked_at,
        revoke_reason
    `,
    [sessionId, reason]
  );

  return result.rows[0] || null;
}

async function updateLastLogin(userId) {
  await pool.query(
    `
      UPDATE users
      SET
        last_login_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
    `,
    [userId]
  );
}

async function recordLoginAttempt({
  userId,
  loginIdentifier,
  ipAddress,
  userAgent,
  success,
  failureReason,
}) {
  await pool.query(
    `
      INSERT INTO login_attempts (
        user_id,
        login_identifier,
        ip_address,
        user_agent,
        success,
        failure_reason
      )
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [
      userId || null,
      loginIdentifier,
      ipAddress || null,
      userAgent || null,
      success,
      failureReason || null,
    ]
  );
}

async function recordPermissionCheck({
  userId,
  permissionName,
  resourceType,
  resourceId,
  action,
  allowed,
  denialReason,
  ipAddress,
  requestId,
}) {
  await pool.query(
    `
      INSERT INTO permission_checks (
        user_id,
        permission_name,
        resource_type,
        resource_id,
        action,
        allowed,
        denial_reason,
        ip_address,
        request_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    [
      userId || null,
      permissionName,
      resourceType || null,
      resourceId || null,
      action,
      allowed,
      denialReason || null,
      ipAddress || null,
      requestId || null,
    ]
  );
}

async function changePassword({
  userId,
  newPasswordHash,
}) {
  const result = await pool.query(
    `
      UPDATE users
      SET
        password_hash = $2,
        must_change_password = FALSE,
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        user_number,
        status,
        must_change_password,
        updated_at
    `,
    [userId, newPasswordHash]
  );

  return result.rows[0] || null;
}

module.exports = {
  findUserByIdentifier,
  getUserRolesAndPermissions,
  getUserProfile,
  changePassword,
  createSession,
  findActiveSession,
  revokeSession,
  updateLastLogin,
  recordLoginAttempt,
  recordPermissionCheck,
  findUserById,
};