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

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?(?:Z|[+-](?:0\d|1\d|2[0-3]):[0-5]\d)?$/;
const ISRAELI_PHONE_PATTERN = /^(?:0(?:5[0-9]|[2-4|8-9][0-9])-?\d{7}|(?:\+?972-?)?5[0-9]-?\d{7})$/;

function validateIsraeliPhone(value) {
  if (value === null || value === undefined) {
    return { value: null, valid: true };
  }
  
  if (typeof value !== 'string') {
    return { value: null, valid: false };
  }
  
  const trimmed = value.trim();
  if (!trimmed) {
    return { value: null, valid: true };
  }
  
  const normalized = trimmed.replace(/[\s-]/g, '');
  if (ISRAELI_PHONE_PATTERN.test(normalized)) {
    return { value: trimmed, valid: true };
  }
  
  return { value: null, valid: false };
}

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

function coerceDayOfWeek(value) {
  if (value === null || value === undefined || value === '') {
    return { value: null, valid: true };
  }

  const numeric = typeof value === 'number' ? value : Number.parseInt(String(value).trim(), 10);

  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 7) {
    return { value: numeric, valid: true };
  }

  return { value: null, valid: false };
}

function coerceSessionTime(value) {
  if (value === null || value === undefined || value === '') {
    return { value: null, valid: true };
  }

  if (typeof value !== 'string') {
    return { value: null, valid: false };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return { value: null, valid: true };
  }

  if (TIME_PATTERN.test(trimmed)) {
    return { value: trimmed, valid: true };
  }

  return { value: null, valid: false };
}

function coerceTags(value) {
  if (value === null || value === undefined) {
    return { value: null, valid: true };
  }

  if (Array.isArray(value)) {
    const normalized = value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter(Boolean);
    return { value: normalized.length ? normalized : null, valid: true };
  }

  if (typeof value === 'string') {
    const normalized = value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    return { value: normalized.length ? normalized : null, valid: true };
  }

  return { value: null, valid: false };
}

function coerceBooleanFlag(raw, { defaultValue = null, allowUndefined = true } = {}) {
  if (raw === undefined) {
    return { value: defaultValue, valid: allowUndefined, provided: false };
  }

  if (raw === null) {
    return { value: defaultValue, valid: false, provided: true };
  }

  if (typeof raw === 'boolean') {
    return { value: raw, valid: true, provided: true };
  }

  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase();
    if (!normalized) {
      return { value: defaultValue, valid: false, provided: true };
    }
    if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'y' || normalized === 'on') {
      return { value: true, valid: true, provided: true };
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'n' || normalized === 'off') {
      return { value: false, valid: true, provided: true };
    }
    return { value: defaultValue, valid: false, provided: true };
  }

  if (typeof raw === 'number') {
    if (raw === 1) {
      return { value: true, valid: true, provided: true };
    }
    if (raw === 0) {
      return { value: false, valid: true, provided: true };
    }
  }

  return { value: defaultValue, valid: false, provided: true };
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

  return {
    payload: {
      name,
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
    const normalized = buildStudentPayload(body);
    if (normalized.error) {
      const message =
        normalized.error === 'missing_name'
          ? 'missing student name'
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
