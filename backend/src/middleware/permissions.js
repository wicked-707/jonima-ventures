const { pool } = require('../config/database');

function requirePermission(permissionName, options = {}) {
  return async function permissionMiddleware(req, res, next) {
    try {
      if (!req.auth?.userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
      }

      if (!permissionName) {
        return res.status(500).json({
          success: false,
          message: 'Permission name is required',
        });
      }

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
        [req.auth.userId, permissionName]
      );

      const allowed = result.rows[0].allowed;

      if (!allowed) {
        if (options.audit !== false) {
          await recordPermissionCheck({
            userId: req.auth.userId,
            permissionName,
            resourceType: options.resourceType,
            resourceId: options.resourceId
              ? req.params?.[options.resourceId]
              : null,
            action: options.action || req.method,
            allowed: false,
            denialReason: 'PERMISSION_DENIED',
            ipAddress: req.ip,
            requestId: req.id,
          });
        }

        return res.status(403).json({
          success: false,
          message: 'You do not have permission to perform this action',
          permission: permissionName,
        });
      }

      if (options.audit !== false) {
        await recordPermissionCheck({
          userId: req.auth.userId,
          permissionName,
          resourceType: options.resourceType,
          resourceId: options.resourceId
            ? req.params?.[options.resourceId]
            : null,
          action: options.action || req.method,
          allowed: true,
          ipAddress: req.ip,
          requestId: req.id,
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
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
  try {
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
        action || 'UNKNOWN',
        allowed,
        denialReason || null,
        ipAddress || null,
        requestId || null,
      ]
    );
  } catch (error) {
    console.error('Failed to record permission check:', error.message);
  }
}

module.exports = {
  requirePermission,
  recordPermissionCheck,
};
