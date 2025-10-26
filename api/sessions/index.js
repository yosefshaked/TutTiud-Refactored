/* eslint-env node */
import { resolveBearerAuthorization } from '../_shared/http.js';
import { createSupabaseAdminClient, readSupabaseAdminConfig } from '../_shared/supabase-admin.js';
import {
  UUID_PATTERN,
  ensureMembership,
  normalizeString,
  parseRequestBody,
  readEnv,
  respond,
  resolveOrgId,
  resolveTenantClient,
} from '../_shared/org-bff.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function sanitizeAnswerValue(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => {
      if (typeof entry === 'string') {
        const trimmed = entry.trim();
        return trimmed === '' ? null : trimmed;
      }
      return entry;
    });
  }

  if (typeof value === 'object') {
    const nested = {};
    for (const [key, entry] of Object.entries(value)) {
      const normalizedKey = typeof key === 'string' ? key.trim() : '';
      if (!normalizedKey) {
        continue;
      }
      nested[normalizedKey] = sanitizeAnswerValue(entry);
    }
    return nested;
  }

  return null;
}

function coerceSessionContent(source) {
  if (source === null || source === undefined) {
    return { error: 'missing_content' };
  }

  let payload = source;

  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (!trimmed) {
      return { value: {} };
    }

    try {
      payload = JSON.parse(trimmed);
    } catch {
      return { error: 'invalid_content' };
    }
  }

  if (typeof payload !== 'object' || Array.isArray(payload)) {
    return { error: 'invalid_content' };
  }

  const normalized = {};
  for (const [key, value] of Object.entries(payload)) {
    const normalizedKey = typeof key === 'string' ? key.trim() : '';
    if (!normalizedKey) {
      continue;
    }

    if (value === undefined) {
      continue;
    }

    normalized[normalizedKey] = sanitizeAnswerValue(value);
  }

  return { value: normalized };
}

function coerceOptionalText(value) {
  if (value === null || value === undefined) {
    return { value: null, valid: true };
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return { value: trimmed || null, valid: true };
  }
  return { value: null, valid: false };
}

function resolveContentCandidate(body) {
  if (!body || typeof body !== 'object') {
    return undefined;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'content')) {
    return body.content;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'answers')) {
    return body.answers;
  }

  return undefined;
}

function validatePayload(body) {
  const studentId = normalizeString(body?.student_id || body?.studentId);
  if (!studentId || !UUID_PATTERN.test(studentId)) {
    return { error: 'invalid_student_id' };
  }

  const date = normalizeString(body?.date);
  if (!date || !DATE_PATTERN.test(date)) {
    return { error: 'invalid_date' };
  }

  const contentSource = resolveContentCandidate(body);
  const contentResult = coerceSessionContent(contentSource);
  if (contentResult.error) {
    return { error: contentResult.error };
  }

  const hasServiceField =
    Object.prototype.hasOwnProperty.call(body ?? {}, 'service_context') ||
    Object.prototype.hasOwnProperty.call(body ?? {}, 'serviceContext');

  const serviceResult = coerceOptionalText(body?.service_context ?? body?.serviceContext);
  if (!serviceResult.valid) {
    return { error: 'invalid_service_context' };
  }

  return {
    studentId,
    date,
    content: contentResult.value,
    serviceContext: serviceResult.value,
    hasExplicitService: hasServiceField,
  };
}

function isMemberRole(role) {
  const normalized = normalizeString(role).toLowerCase();
  return normalized === 'member';
}

function extractSessionFormVersion(value) {
  if (value === null || value === undefined) {
    return null;
  }

  let payload = value;
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (!trimmed) {
      return null;
    }
    try {
      payload = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const candidate = Object.prototype.hasOwnProperty.call(payload, 'version')
    ? payload.version
    : null;

  if (candidate === null || candidate === undefined) {
    return null;
  }

  const numeric = typeof candidate === 'number'
    ? candidate
    : Number.parseInt(String(candidate).trim(), 10);

  if (Number.isInteger(numeric) && numeric >= 0) {
    return numeric;
  }

  return null;
}

async function resolveSessionFormVersion(tenantClient) {
  const { data, error } = await tenantClient
    .from('Settings')
    .select('settings_value')
    .eq('key', 'session_form_config')
    .maybeSingle();

  if (error) {
    return { error };
  }

  return { version: extractSessionFormVersion(data?.settings_value) };
}

export default async function (context, req) {
  const env = readEnv(context);
  const adminConfig = readSupabaseAdminConfig(env);

  if (!adminConfig.supabaseUrl || !adminConfig.serviceRoleKey) {
    context.log?.error?.('sessions missing Supabase admin credentials');
    return respond(context, 500, { message: 'server_misconfigured' });
  }

  const authorization = resolveBearerAuthorization(req);
  if (!authorization?.token) {
    context.log?.warn?.('sessions missing bearer token');
    return respond(context, 401, { message: 'missing bearer' });
  }

  const supabase = createSupabaseAdminClient(adminConfig);

  let authResult;
  try {
    authResult = await supabase.auth.getUser(authorization.token);
  } catch (error) {
    context.log?.error?.('sessions failed to validate token', { message: error?.message });
    return respond(context, 401, { message: 'invalid or expired token' });
  }

  if (authResult.error || !authResult.data?.user?.id) {
    return respond(context, 401, { message: 'invalid or expired token' });
  }

  const userId = authResult.data.user.id;
  const body = parseRequestBody(req);
  const orgId = resolveOrgId(req, body);

  if (!orgId) {
    return respond(context, 400, { message: 'invalid org id' });
  }

  let role;
  try {
    role = await ensureMembership(supabase, orgId, userId);
  } catch (membershipError) {
    context.log?.error?.('sessions failed to verify membership', {
      message: membershipError?.message,
      orgId,
      userId,
    });
    return respond(context, 500, { message: 'failed_to_verify_membership' });
  }

  if (!role) {
    return respond(context, 403, { message: 'forbidden' });
  }

  const validation = validatePayload(body);
  if (validation.error) {
    const message =
      validation.error === 'invalid_student_id'
        ? 'invalid student id'
        : validation.error === 'invalid_date'
          ? 'invalid date'
          : validation.error === 'missing_content'
            ? 'missing session content'
            : validation.error === 'invalid_service_context'
              ? 'invalid service context'
              : 'invalid content';
    return respond(context, 400, { message });
  }

  const { client: tenantClient, error: tenantError } = await resolveTenantClient(context, supabase, env, orgId);
  if (tenantError) {
    return respond(context, tenantError.status, tenantError.body);
  }

  const studentResult = await tenantClient
    .from('Students')
    .select('id, assigned_instructor_id, default_service')
    .eq('id', validation.studentId)
    .maybeSingle();

  if (studentResult.error) {
    context.log?.error?.('sessions failed to load student', { message: studentResult.error.message });
    return respond(context, 500, { message: 'failed_to_load_student' });
  }

  if (!studentResult.data) {
    return respond(context, 404, { message: 'student_not_found' });
  }

  const assignedInstructor = normalizeString(studentResult.data.assigned_instructor_id) || '';
  const normalizedUserId = normalizeString(userId);

  if (isMemberRole(role) && assignedInstructor && assignedInstructor !== normalizedUserId) {
    return respond(context, 403, { message: 'student_not_assigned_to_user' });
  }

  if (isMemberRole(role) && !assignedInstructor) {
    return respond(context, 403, { message: 'student_not_assigned_to_user' });
  }

  // Resolve which instructor id should be written on the session.
  // For members: we've already verified assignment above, so we can use the student's assigned instructor id.
  // For admins/owners: prefer the student's assigned instructor; if missing, only fall back to the acting user
  // when that user is actually an Instructor in this tenant. Otherwise, surface a clear validation error
  // instead of letting the DB raise a foreign-key violation (which previously produced a 500).
  let sessionInstructorId = assignedInstructor;
  if (!sessionInstructorId && !isMemberRole(role) && normalizedUserId) {
    const instructorLookup = await tenantClient
      .from('Instructors')
      .select('id, is_active')
      .eq('id', normalizedUserId)
      .maybeSingle();

    if (instructorLookup.error) {
      context.log?.error?.('sessions failed to verify acting user is instructor', { message: instructorLookup.error.message });
      return respond(context, 500, { message: 'failed_to_verify_instructor' });
    }

    if (instructorLookup.data && instructorLookup.data.id) {
      sessionInstructorId = instructorLookup.data.id;
    }
  }

  // If after resolution there's still no instructor to attribute to, block with a specific message.
  if (!sessionInstructorId) {
    return respond(context, 400, { message: 'student_missing_instructor' });
  }

  const formVersionResult = await resolveSessionFormVersion(tenantClient);
  if (formVersionResult.error) {
    context.log?.error?.('sessions failed to resolve form version', {
      message: formVersionResult.error.message,
    });
  }

  const metadataPayload = {};
  if (formVersionResult.version !== null) {
    metadataPayload.form_version = formVersionResult.version;
  }
  if (normalizedUserId) {
    metadataPayload.created_by = normalizedUserId;
  }
  const normalizedRole = normalizeString(role);
  if (normalizedRole) {
    metadataPayload.created_role = normalizedRole.toLowerCase();
  }

  const metadata = Object.keys(metadataPayload).length ? metadataPayload : null;

  const { data, error } = await tenantClient
    .from('SessionRecords')
    .insert([
      {
        student_id: validation.studentId,
        date: validation.date,
        content: validation.content,
  instructor_id: sessionInstructorId || null,
        service_context: validation.hasExplicitService
          ? validation.serviceContext
          : validation.serviceContext ?? studentResult.data.default_service ?? null,
        metadata,
      },
    ])
    .select()
    .single();

  if (error) {
    context.log?.error?.('sessions failed to create session record', { message: error.message });
    return respond(context, 500, { message: 'failed_to_create_session' });
  }

  return respond(context, 201, data);
}
