const ADMIN_ROLES = new Set(['admin', 'owner']);

export function normalizeMembershipRole(role) {
  if (typeof role !== 'string') {
    return 'member';
  }
  return role.trim().toLowerCase();
}

function resolveStatusParam(options) {
  if (!options || typeof options !== 'object') {
    return '';
  }
  if (typeof options.status === 'string' && options.status.trim()) {
    return options.status.trim().toLowerCase();
  }
  if (options.includeInactive === true) {
    return 'all';
  }
  return '';
}

export function buildStudentsEndpoint(orgId, role, options = {}) {
  const normalized = normalizeMembershipRole(role);
  const isAdmin = ADMIN_ROLES.has(normalized);
  const searchParams = new URLSearchParams();

  if (orgId) {
    searchParams.set('org_id', orgId);
  }

  if (options.assignedInstructorId) {
    searchParams.set('assigned_instructor_id', options.assignedInstructorId);
  }

  const status = resolveStatusParam(options);
  if (status === 'inactive' || status === 'all' || status === 'active') {
    searchParams.set('status', status);
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
