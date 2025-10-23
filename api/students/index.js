/* eslint-env node */
import { resolveBearerAuthorization } from '../_shared/http.js';
import { createSupabaseAdminClient, readSupabaseAdminConfig } from '../_shared/supabase-admin.js';
import {
  UUID_PATTERN,
  ensureMembership,
  isAdminRole,
  normalizeString,
  parseRequestBody,
  readEnv,
  respond,
  resolveOrgId,
  resolveTenantClient,
} from '../_shared/org-bff.js';

function extractStudentId(context, req, body) {
  const candidate =
    normalizeString(context?.bindingData?.studentId) ||
    normalizeString(body?.student_id) ||
    normalizeString(body?.studentId);

  if (candidate && UUID_PATTERN.test(candidate)) {
    return candidate;
  }
  return '';
}

function validateAssignedInstructor(candidate) {
  if (candidate === null) {
    return { value: null, valid: true };
  }
  if (typeof candidate === 'string') {
    const trimmed = candidate.trim();
    if (!trimmed) {
      return { value: null, valid: true };
    }
    if (UUID_PATTERN.test(trimmed)) {
      return { value: trimmed, valid: true };
    }
  }
  return { value: null, valid: false };
}

function buildStudentPayload(body) {
  const name = normalizeString(body?.name);
  if (!name) {
    return { error: 'missing_name' };
  }

  const contactInfo = typeof body?.contact_info === 'string'
    ? body.contact_info.trim()
    : typeof body?.contactInfo === 'string'
      ? body.contactInfo.trim()
      : '';

  const rawInstructor = body?.assigned_instructor_id ?? body?.assignedInstructorId ?? null;
  const { value: instructorId, valid } = validateAssignedInstructor(rawInstructor);

  if (!valid) {
    return { error: 'invalid_assigned_instructor' };
  }

  return {
    payload: {
      name,
      contact_info: contactInfo || null,
      assigned_instructor_id: instructorId,
    },
  };
}

function buildStudentUpdates(body) {
  const updates = {};
  let hasAny = false;

  if (Object.prototype.hasOwnProperty.call(body, 'name')) {
    const name = normalizeString(body.name);
    if (!name) {
      return { error: 'invalid_name' };
    }
    updates.name = name;
    hasAny = true;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'contact_info') || Object.prototype.hasOwnProperty.call(body, 'contactInfo')) {
    const source = Object.prototype.hasOwnProperty.call(body, 'contact_info') ? body.contact_info : body.contactInfo;
    if (source === null || source === undefined) {
      updates.contact_info = null;
    } else if (typeof source === 'string') {
      updates.contact_info = source.trim() || null;
    } else {
      return { error: 'invalid_contact_info' };
    }
    hasAny = true;
  }

  if (
    Object.prototype.hasOwnProperty.call(body, 'assigned_instructor_id') ||
    Object.prototype.hasOwnProperty.call(body, 'assignedInstructorId')
  ) {
    const raw = Object.prototype.hasOwnProperty.call(body, 'assigned_instructor_id')
      ? body.assigned_instructor_id
      : body.assignedInstructorId;

    if (raw === null) {
      updates.assigned_instructor_id = null;
      hasAny = true;
    } else if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (!trimmed) {
        updates.assigned_instructor_id = null;
        hasAny = true;
      } else if (UUID_PATTERN.test(trimmed)) {
        updates.assigned_instructor_id = trimmed;
        hasAny = true;
      } else {
        return { error: 'invalid_assigned_instructor' };
      }
    } else {
      return { error: 'invalid_assigned_instructor' };
    }
  }

  if (!hasAny) {
    return { error: 'missing_updates' };
  }

  return { updates };
}

export default async function (context, req) {
  const method = String(req.method || 'GET').toUpperCase();
  if (!['GET', 'POST', 'PUT'].includes(method)) {
    return respond(context, 405, { message: 'method_not_allowed' }, { Allow: 'GET,POST,PUT' });
  }

  const env = readEnv(context);
  const adminConfig = readSupabaseAdminConfig(env);

  if (!adminConfig.supabaseUrl || !adminConfig.serviceRoleKey) {
    context.log?.error?.('students missing Supabase admin credentials');
    return respond(context, 500, { message: 'server_misconfigured' });
  }

  const authorization = resolveBearerAuthorization(req);
  if (!authorization?.token) {
    context.log?.warn?.('students missing bearer token');
    return respond(context, 401, { message: 'missing bearer' });
  }

  const supabase = createSupabaseAdminClient(adminConfig);

  let authResult;
  try {
    authResult = await supabase.auth.getUser(authorization.token);
  } catch (error) {
    context.log?.error?.('students failed to validate token', { message: error?.message });
    return respond(context, 401, { message: 'invalid or expired token' });
  }

  if (authResult.error || !authResult.data?.user?.id) {
    return respond(context, 401, { message: 'invalid or expired token' });
  }

  const userId = authResult.data.user.id;
  const body = method === 'GET' ? parseRequestBody(null) : parseRequestBody(req);
  const orgId = resolveOrgId(req, body);

  if (!orgId) {
    return respond(context, 400, { message: 'invalid org id' });
  }

  let role;
  try {
    role = await ensureMembership(supabase, orgId, userId);
  } catch (membershipError) {
    context.log?.error?.('students failed to verify membership', {
      message: membershipError?.message,
      orgId,
      userId,
    });
    return respond(context, 500, { message: 'failed_to_verify_membership' });
  }

  if (!role || !isAdminRole(role)) {
    return respond(context, 403, { message: 'forbidden' });
  }

  const { client: tenantClient, error: tenantError } = await resolveTenantClient(context, supabase, env, orgId);
  if (tenantError) {
    return respond(context, tenantError.status, tenantError.body);
  }

  if (method === 'GET') {
    const { data, error } = await tenantClient
      .from('Students')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      context.log?.error?.('students failed to fetch roster', { message: error.message });
      return respond(context, 500, { message: 'failed_to_load_students' });
    }

    return respond(context, 200, Array.isArray(data) ? data : []);
  }

  if (method === 'POST') {
    const normalized = buildStudentPayload(body);
    if (normalized.error) {
      const message =
        normalized.error === 'missing_name'
          ? 'missing student name'
          : normalized.error === 'invalid_assigned_instructor'
            ? 'invalid assigned instructor id'
            : 'invalid payload';
      return respond(context, 400, { message });
    }

    const { data, error } = await tenantClient
      .from('Students')
      .insert([normalized.payload])
      .select()
      .single();

    if (error) {
      context.log?.error?.('students failed to create student', { message: error.message });
      return respond(context, 500, { message: 'failed_to_create_student' });
    }

    return respond(context, 201, data);
  }

  const studentId = extractStudentId(context, req, body);
  if (!studentId) {
    return respond(context, 400, { message: 'invalid student id' });
  }

  const normalizedUpdates = buildStudentUpdates(body);
  if (normalizedUpdates.error) {
    const updateMessage =
      normalizedUpdates.error === 'missing_updates'
        ? 'no updatable fields provided'
        : normalizedUpdates.error === 'invalid_name'
          ? 'invalid name'
          : normalizedUpdates.error === 'invalid_contact_info'
            ? 'invalid contact info'
            : 'invalid assigned instructor id';
    return respond(context, 400, { message: updateMessage });
  }

  const { data, error } = await tenantClient
    .from('Students')
    .update(normalizedUpdates.updates)
    .eq('id', studentId)
    .select()
    .maybeSingle();

  if (error) {
    context.log?.error?.('students failed to update student', { message: error.message, studentId });
    return respond(context, 500, { message: 'failed_to_update_student' });
  }

  if (!data) {
    return respond(context, 404, { message: 'student_not_found' });
  }

  return respond(context, 200, data);
}
