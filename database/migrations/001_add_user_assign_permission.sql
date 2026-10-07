BEGIN;

INSERT INTO permissions (name, description)
VALUES (
    'user.assign',
    'Assign users to operational regions and assignments'
)
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'SUPERADMIN'
  AND p.name = 'user.assign'
ON CONFLICT DO NOTHING;

COMMIT;
