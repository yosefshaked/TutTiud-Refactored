const ADMIN_ROLES = new Set(['admin', 'owner']);

export function normalizeMembershipRole(role) {
  if (typeof role !== 'string') {
    return 'member';
  }
  return role.trim().toLowerCase();
}

export function buildStudentsEndpoint(orgId, role) {
  const normalized = normalizeMembershipRole(role);
  const isAdmin = ADMIN_ROLES.has(normalized);
  const searchParams = new URLSearchParams();
  if (orgId) {
    searchParams.set('org_id', orgId);
  }
  const suffix = searchParams.toString();
  const base = isAdmin ? 'students' : 'my-students';
  if (suffix) {
    return `${base}?${suffix}`;
  }
  return base;
}

export function isAdminRole(role) {
  return ADMIN_ROLES.has(normalizeMembershipRole(role));
}
