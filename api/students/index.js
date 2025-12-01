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
import { logAuditEvent, AUDIT_ACTIONS, AUDIT_CATEGORIES } from '../_shared/audit-log.js';
import {
  coerceBooleanFlag,
  coerceDayOfWeek,
  coerceNationalId,
  coerceOptionalText,
  coerceSessionTime,
  coerceTags,
  validateAssignedInstructor,
  validateIsraeliPhone,
} from '../_shared/student-validation.js';

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

async function findStudentByNationalId(tenantClient, nationalId, { excludeId } = {}) {
  if (!nationalId) {
    return { data: null, error: null };
  }

  let query = tenantClient.from('Students').select('id, name, is_active, national_id').eq('national_id', nationalId).limit(1);

  if (excludeId) {
    query = query.neq('id', excludeId);
  }

  const { data, error } = await query.maybeSingle();
  return { data, error };
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

  const contactNameResult = coerceOptionalText(body?.contact_name ?? body?.contactName);
  if (!contactNameResult.valid) {
    return { error: 'invalid_contact_name' };
  }

  const contactPhoneResult = validateIsraeliPhone(body?.contact_phone ?? body?.contactPhone);
  if (!contactPhoneResult.valid) {
    return { error: 'invalid_contact_phone' };
  }

  const defaultServiceResult = coerceOptionalText(body?.default_service ?? body?.defaultService);
  if (!defaultServiceResult.valid) {
    return { error: 'invalid_default_service' };
  }

  const dayResult = coerceDayOfWeek(body?.default_day_of_week ?? body?.defaultDayOfWeek);
  if (!dayResult.valid) {
    return { error: 'invalid_default_day' };
  }

  const sessionTimeResult = coerceSessionTime(body?.default_session_time ?? body?.defaultSessionTime);
  if (!sessionTimeResult.valid) {
    return { error: 'invalid_default_session_time' };
  }

  const notesResult = coerceOptionalText(body?.notes);
  if (!notesResult.valid) {
    return { error: 'invalid_notes' };
  }

  const tagsResult = coerceTags(body?.tags);
  if (!tagsResult.valid) {
    return { error: 'invalid_tags' };
  }

  const isActiveResult = coerceBooleanFlag(body?.is_active ?? body?.isActive, { defaultValue: true });
  if (!isActiveResult.valid) {
    return { error: 'invalid_is_active' };
  }

  const isActiveValue = isActiveResult.provided ? Boolean(isActiveResult.value) : true;

  // Debug log for national_id
  console.log('[DEBUG buildStudentPayload] national_id extraction:', {
    snake_case: body?.national_id,
    camelCase: body?.nationalId,
    resolved: body?.national_id ?? body?.nationalId,
  });

  const nationalIdResult = coerceNationalId(body?.national_id ?? body?.nationalId);
  if (!nationalIdResult.valid) {
    return { error: 'invalid_national_id' };
  }
  
  // National ID is required
  if (!nationalIdResult.value) {
    console.log('[DEBUG buildStudentPayload] National ID missing!', {
      nationalIdResult,
      bodyKeys: Object.keys(body || {}),
    });
    return { error: 'missing_national_id' };
  }

  return {
    payload: {
      name,
      national_id: nationalIdResult.value,
      contact_info: contactInfo || null,
      contact_name: contactNameResult.value,
      contact_phone: contactPhoneResult.value,
      assigned_instructor_id: instructorId,
      default_day_of_week: dayResult.value,
      default_session_time: sessionTimeResult.value,
      default_service: defaultServiceResult.value,
      notes: notesResult.value,
      tags: tagsResult.value,
      is_active: isActiveValue,
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
    updates['name'] = name;
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

  if (Object.prototype.hasOwnProperty.call(body, 'contact_name') || Object.prototype.hasOwnProperty.call(body, 'contactName')) {
    const { value, valid } = coerceOptionalText(
      Object.prototype.hasOwnProperty.call(body, 'contact_name') ? body.contact_name : body.contactName,
    );
    if (!valid) {
      return { error: 'invalid_contact_name' };
    }
    updates.contact_name = value;
    hasAny = true;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'contact_phone') || Object.prototype.hasOwnProperty.call(body, 'contactPhone')) {
    const { value, valid } = validateIsraeliPhone(
      Object.prototype.hasOwnProperty.call(body, 'contact_phone') ? body.contact_phone : body.contactPhone,
    );
    if (!valid) {
      return { error: 'invalid_contact_phone' };
    }
    updates.contact_phone = value;
    hasAny = true;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'default_service') || Object.prototype.hasOwnProperty.call(body, 'defaultService')) {
    const { value, valid } = coerceOptionalText(
      Object.prototype.hasOwnProperty.call(body, 'default_service') ? body.default_service : body.defaultService,
    );
    if (!valid) {
      return { error: 'invalid_default_service' };
    }
    updates.default_service = value;
    hasAny = true;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'default_day_of_week') || Object.prototype.hasOwnProperty.call(body, 'defaultDayOfWeek')) {
    const { value, valid } = coerceDayOfWeek(
      Object.prototype.hasOwnProperty.call(body, 'default_day_of_week') ? body.default_day_of_week : body.defaultDayOfWeek,
    );
    if (!valid) {
      return { error: 'invalid_default_day' };
    }
    updates.default_day_of_week = value;
    hasAny = true;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'default_session_time') || Object.prototype.hasOwnProperty.call(body, 'defaultSessionTime')) {
    const { value, valid } = coerceSessionTime(
      Object.prototype.hasOwnProperty.call(body, 'default_session_time') ? body.default_session_time : body.defaultSessionTime,
    );
    if (!valid) {
      return { error: 'invalid_default_session_time' };
    }
    updates.default_session_time = value;
    hasAny = true;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'tags')) {
    const { value, valid } = coerceTags(body.tags);
    if (!valid) {
      return { error: 'invalid_tags' };
    }
    updates.tags = value;
    hasAny = true;
  }

  if (
    Object.prototype.hasOwnProperty.call(body, 'is_active') ||
    Object.prototype.hasOwnProperty.call(body, 'isActive')
  ) {
    const source = Object.prototype.hasOwnProperty.call(body, 'is_active') ? body.is_active : body.isActive;
    const { value, valid } = coerceBooleanFlag(source, { defaultValue: true, allowUndefined: false });
    if (!valid) {
      return { error: 'invalid_is_active' };
    }
    updates.is_active = Boolean(value);
    hasAny = true;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'notes')) {
    const { value, valid } = coerceOptionalText(body.notes);
    if (!valid) {
      return { error: 'invalid_notes' };
    }
    updates.notes = value;
    hasAny = true;
  }

  if (
    Object.prototype.hasOwnProperty.call(body, 'national_id') ||
    Object.prototype.hasOwnProperty.call(body, 'nationalId')
  ) {
    const { value, valid } = coerceNationalId(
      Object.prototype.hasOwnProperty.call(body, 'national_id') ? body.national_id : body.nationalId,
    );
    if (!valid) {
      return { error: 'invalid_national_id' };
    }
    updates.national_id = value;
    hasAny = true;
  }

  if (!hasAny) {
    return { error: 'missing_updates' };
  }

  return { updates };
}

function determineStatusFilter(query) {
  const status = normalizeString(query?.status);
  if (status === 'inactive') {
    return 'inactive';
  }
  if (status === 'all') {
    return 'all';
  }
  const includeInactive = query?.include_inactive ?? query?.includeInactive;
  const includeFlag = coerceBooleanFlag(includeInactive, { defaultValue: false, allowUndefined: true });
  if (includeFlag.valid && includeFlag.value) {
    return 'all';
  }
  return 'active';
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
    // Optional server-side filter: assigned_instructor_id (admins only)
    const assignedInstructorId = normalizeString(req?.query?.assigned_instructor_id);

    let builder = tenantClient
      .from('Students')
      .select('*')
      .order('name', { ascending: true });

    if (assignedInstructorId) {
      builder = builder.eq('assigned_instructor_id', assignedInstructorId);
    }

    const statusFilter = determineStatusFilter(req?.query);
    if (statusFilter === 'active') {
      builder = builder.eq('is_active', true);
    } else if (statusFilter === 'inactive') {
      builder = builder.eq('is_active', false);
    }

    const { data, error } = await builder;

    if (error) {
      context.log?.error?.('students failed to fetch roster', { message: error.message });
      return respond(context, 500, { message: 'failed_to_load_students' });
    }

    return respond(context, 200, Array.isArray(data) ? data : []);
  }

  if (method === 'POST') {
    context.log?.info?.('[DEBUG] POST /api/students received', {
      bodyKeys: Object.keys(body || {}),
      nationalId: body?.national_id,
      nationalIdCamel: body?.nationalId,
      rawBody: JSON.stringify(body).substring(0, 200),
    });

    const normalized = buildStudentPayload(body);
    if (normalized.error) {
      const message =
        normalized.error === 'missing_name'
          ? 'missing student name'
          : normalized.error === 'missing_national_id'
            ? 'missing national id'
          : normalized.error === 'invalid_national_id'
            ? 'invalid national id'
          : normalized.error === 'invalid_assigned_instructor'
            ? 'invalid assigned instructor id'
            : normalized.error === 'invalid_contact_name'
              ? 'invalid contact name'
              : normalized.error === 'invalid_contact_phone'
                ? 'invalid contact phone'
                : normalized.error === 'invalid_default_service'
                  ? 'invalid default service'
                  : normalized.error === 'invalid_default_day'
                    ? 'invalid default day of week'
          : normalized.error === 'invalid_default_session_time'
            ? 'invalid default session time'
            : normalized.error === 'invalid_notes'
              ? 'invalid notes'
              : normalized.error === 'invalid_tags'
                ? 'invalid tags'
                : normalized.error === 'invalid_is_active'
                  ? 'invalid is_active flag'
                  : 'invalid payload';
      return respond(context, 400, { message });
    }

    if (normalized.payload.national_id) {
      const { data: existingByNationalId, error: nationalIdLookupError } = await findStudentByNationalId(
        tenantClient,
        normalized.payload.national_id,
      );

      if (nationalIdLookupError) {
        context.log?.error?.('students failed to check national id uniqueness', { message: nationalIdLookupError.message });
        return respond(context, 500, { message: 'failed_to_validate_national_id' });
      }

      if (existingByNationalId) {
        return respond(context, 409, { message: 'duplicate_national_id', student: existingByNationalId });
      }
    }

    // Build metadata with creator information
    const metadata = {
      created_by: userId,
      created_at: new Date().toISOString(),
      created_role: role,
    };

    const recordToInsert = {
      ...normalized.payload,
      metadata,
    };

    const { data, error } = await tenantClient
      .from('Students')
      .insert([recordToInsert])
      .select()
      .single();

    if (error) {
      context.log?.error?.('students failed to create student', { message: error.message });
      return respond(context, 500, { message: 'failed_to_create_student' });
    }

    // Audit log: student created
    await logAuditEvent(supabase, {
      orgId,
      userId,
      userEmail: authResult.data.user.email || '',
      userRole: role,
      actionType: AUDIT_ACTIONS.STUDENT_CREATED,
      actionCategory: AUDIT_CATEGORIES.STUDENTS,
      resourceType: 'student',
      resourceId: data.id,
      details: {
        student_name: data.name,
        assigned_instructor_id: data.assigned_instructor_id,
      },
    });

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
        : normalizedUpdates.error === 'invalid_national_id'
          ? 'invalid national id'
        : normalizedUpdates.error === 'invalid_name'
          ? 'invalid name'
          : normalizedUpdates.error === 'invalid_contact_info'
            ? 'invalid contact info'
            : normalizedUpdates.error === 'invalid_assigned_instructor'
              ? 'invalid assigned instructor id'
              : normalizedUpdates.error === 'invalid_contact_name'
                ? 'invalid contact name'
                : normalizedUpdates.error === 'invalid_contact_phone'
                  ? 'invalid contact phone'
                  : normalizedUpdates.error === 'invalid_default_service'
                    ? 'invalid default service'
                    : normalizedUpdates.error === 'invalid_default_day'
                      ? 'invalid default day of week'
          : normalizedUpdates.error === 'invalid_default_session_time'
            ? 'invalid default session time'
            : normalizedUpdates.error === 'invalid_notes'
              ? 'invalid notes'
              : normalizedUpdates.error === 'invalid_tags'
                ? 'invalid tags'
                : normalizedUpdates.error === 'invalid_is_active'
                  ? 'invalid is_active flag'
                  : 'invalid payload';
    return respond(context, 400, { message: updateMessage });
  }

  // Fetch existing student to compare changes and preserve metadata
  const { data: existingStudent, error: fetchError } = await tenantClient
    .from('Students')
    .select('*')
    .eq('id', studentId)
    .maybeSingle();

  if (fetchError) {
    context.log?.error?.('students failed to fetch existing student', { message: fetchError.message, studentId });
    return respond(context, 500, { message: 'failed_to_fetch_student' });
  }

  if (!existingStudent) {
    return respond(context, 404, { message: 'student_not_found' });
  }

  if (Object.prototype.hasOwnProperty.call(normalizedUpdates.updates, 'national_id')) {
    const desiredNationalId = normalizedUpdates.updates.national_id;

    if (desiredNationalId) {
      const { data: conflict, error: lookupError } = await findStudentByNationalId(tenantClient, desiredNationalId, {
        excludeId: studentId,
      });

      if (lookupError) {
        context.log?.error?.('students failed to validate national id on update', {
          message: lookupError.message,
          studentId,
        });
        return respond(context, 500, { message: 'failed_to_validate_national_id' });
      }

      if (conflict) {
        return respond(context, 409, { message: 'duplicate_national_id', student: conflict });
      }
    }
  }

  // Determine which fields actually changed
  const changedFields = [];
  for (const [key, newValue] of Object.entries(normalizedUpdates.updates)) {
    const oldValue = existingStudent[key];
    // Handle null/undefined as equivalent
    const normalizedOld = oldValue === null || oldValue === undefined ? null : oldValue;
    const normalizedNew = newValue === null || newValue === undefined ? null : newValue;
    
    // Deep comparison for objects/arrays, simple comparison for primitives
    if (JSON.stringify(normalizedOld) !== JSON.stringify(normalizedNew)) {
      changedFields.push(key);
    }
  }

  // Build updated metadata preserving existing fields
  const existingMetadata = existingStudent.metadata || {};
  const updatedMetadata = {
    ...existingMetadata,
    updated_by: userId,
    updated_at: new Date().toISOString(),
    updated_role: role,
  };

  const updatesWithMetadata = {
    ...normalizedUpdates.updates,
    metadata: updatedMetadata,
  };

  const { data, error } = await tenantClient
    .from('Students')
    .update(updatesWithMetadata)
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

  // Audit log: student updated
  await logAuditEvent(supabase, {
    orgId,
    userId,
    userEmail: authResult.data.user.email || '',
    userRole: role,
    actionType: AUDIT_ACTIONS.STUDENT_UPDATED,
    actionCategory: AUDIT_CATEGORIES.STUDENTS,
    resourceType: 'student',
    resourceId: studentId,
    details: {
      updated_fields: changedFields,
      student_name: data.name,
    },
  });

  return respond(context, 200, data);
}
