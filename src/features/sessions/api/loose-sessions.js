import { authenticatedFetch } from '@/lib/api-client.js';

export async function fetchLooseSessions({ orgId, signal } = {}) {
  const params = new URLSearchParams();
  if (orgId) params.set('org_id', orgId);
  
  const endpoint = params.toString() ? `loose-sessions?${params}` : 'loose-sessions';
  return authenticatedFetch(endpoint, { signal });
}

export async function assignLooseSession({ sessionId, studentId, orgId, signal } = {}) {
  const body = {
    action: 'assign_existing',
    session_id: sessionId,
    student_id: studentId,
    org_id: orgId,
  };
  
  return authenticatedFetch('loose-sessions', {
    method: 'POST',
    body,
    signal,
  });
}

export async function createAndAssignLooseSession({
  sessionId,
  name,
  assignedInstructorId,
  defaultService,
  orgId,
  signal,
} = {}) {
  const body = {
    action: 'create_and_assign',
    session_id: sessionId,
    name,
    assigned_instructor_id: assignedInstructorId,
    ...(defaultService ? { default_service: defaultService } : {}),
    org_id: orgId,
  };
  
  return authenticatedFetch('loose-sessions', {
    method: 'POST',
    body,
    signal,
  });
}
