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

function validatePayload(body) {
  const studentId = normalizeString(body?.student_id || body?.studentId);
  if (!studentId || !UUID_PATTERN.test(studentId)) {
    return { error: 'invalid_student_id' };
  }

  const date = normalizeString(body?.date);
  if (!date || !DATE_PATTERN.test(date)) {
    return { error: 'invalid_date' };
  }

  const contentSource = body?.content;
  if (contentSource === null || contentSource === undefined) {
    return { error: 'missing_content' };
  }
  if (typeof contentSource !== 'string') {
    return { error: 'invalid_content' };
  }
  const content = contentSource.trim();
  if (!content) {
    return { error: 'invalid_content' };
  }

  return { studentId, date, content };
}

function isMemberRole(role) {
  const normalized = normalizeString(role).toLowerCase();
  return normalized === 'member';
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
            : 'invalid content';
    return respond(context, 400, { message });
  }

  const { client: tenantClient, error: tenantError } = await resolveTenantClient(context, supabase, env, orgId);
  if (tenantError) {
    return respond(context, tenantError.status, tenantError.body);
  }

  const studentResult = await tenantClient
    .from('Students')
    .select('id, assigned_instructor_id')
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

  const sessionInstructorId = assignedInstructor || normalizedUserId;

  const { data, error } = await tenantClient
    .from('SessionRecords')
    .insert([
      {
        student_id: validation.studentId,
        date: validation.date,
        content: validation.content,
        instructor_id: sessionInstructorId || null,
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
