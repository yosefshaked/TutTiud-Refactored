/* eslint-env node */
import { resolveBearerAuthorization } from '../_shared/http.js';
import { createSupabaseAdminClient, readSupabaseAdminConfig } from '../_shared/supabase-admin.js';
import {
  ensureMembership,
  isAdminRole,
  normalizeString,
  parseRequestBody,
  readEnv,
  respond,
  resolveOrgId,
  resolveTenantClient,
  UUID_PATTERN,
} from '../_shared/org-bff.js';
import {
  coerceBooleanFlag,
  coerceDayOfWeek,
  coerceNationalId,
  coerceOptionalText,
  coerceSessionTime,
  coerceTags,
  validateIsraeliPhone,
} from '../_shared/student-validation.js';
import { parseCsv } from '../_shared/csv.js';

const ID_COLUMN_CANDIDATES = ['system_uuid', 'student_id', 'id'];
const IGNORED_COLUMNS = ['extraction_reason', 'סיבת ייצוא']; // Columns to skip during import
const MAX_ROWS = 2000;

function normalizeTagsForCsv(raw) {
  if (typeof raw !== 'string') {
    return raw;
  }
  return raw.replace(/[;|]/g, ',');
}

function addIfChanged(updates, key, newValue, existingValue) {
  const current = existingValue === undefined || existingValue === null ? null : existingValue;
  const desired = newValue === undefined || newValue === null ? null : newValue;
  if (JSON.stringify(current) !== JSON.stringify(desired)) {
    updates[key] = newValue;
  }
}

function formatFailure({ lineNumber, studentId, name, code, message }) {
  return {
    line_number: lineNumber,
    student_id: studentId,
    name,
    code,
    message,
  };
}

export default async function handler(context, req) {
  const env = readEnv(context);
  const supabaseAdminConfig = readSupabaseAdminConfig(env);
  const supabase = createSupabaseAdminClient(supabaseAdminConfig);

  const token = resolveBearerAuthorization(req);
  if (!token) {
    return respond(context, 401, { message: 'missing bearer token' });
  }

  const authResult = await supabase.auth.getUser(token);
  if (authResult.error || !authResult.data?.user?.id) {
    return respond(context, 401, { message: 'invalid or expired token' });
  }

  const userId = authResult.data.user.id;
  const body = parseRequestBody(req);
  const orgId = resolveOrgId(req, body);

  if (!orgId) {
    return respond(context, 400, { message: 'invalid org id' });
  }

  const csvText = normalizeString(body?.csv_text);
  if (!csvText) {
    return respond(context, 400, { message: 'missing_csv' });
  }

  let role;
  try {
    role = await ensureMembership(supabase, orgId, userId);
  } catch (membershipError) {
    context.log?.error?.('students-maintenance-import failed to verify membership', {
      message: membershipError?.message,
      orgId,
      userId,
    });
    return respond(context, 500, { message: 'failed_to_verify_membership' });
  }

  if (!role || !isAdminRole(role)) {
    return respond(context, 403, { message: 'forbidden' });
  }

  const parsed = parseCsv(csvText);
  if (!parsed.columns.length || !parsed.rows.length) {
    return respond(context, 400, { message: 'empty_csv' });
  }

  if (parsed.rows.length > MAX_ROWS) {
    return respond(context, 400, { message: 'too_many_rows', limit: MAX_ROWS });
  }

  // Optional tag mappings: { "unmatched_tag_name": "target_tag_id" }
  // We parse first, then validate against catalog after it's loaded.
  const tagMappings = new Map();
  if (body?.tag_mappings && typeof body.tag_mappings === 'object') {
    for (const [unmatchedName, targetTagId] of Object.entries(body.tag_mappings)) {
      if (typeof targetTagId === 'string' && UUID_PATTERN.test(targetTagId)) {
        const normalized = normalizeString(unmatchedName);
        if (normalized) {
          tagMappings.set(normalized.toLowerCase(), targetTagId);
        }
      }
    }
  }

  const idColumn = parsed.columns.find((col) => ID_COLUMN_CANDIDATES.includes(col.toLowerCase()));
  if (!idColumn) {
    return respond(context, 400, { message: 'missing_id_column' });
  }

  const stagedRows = parsed.rows.map((row, index) => ({
    lineNumber: index + 2, // account for header
    studentId: normalizeString(row[idColumn]),
    raw: row,
  }));

  const validIds = Array.from(new Set(stagedRows
    .map((entry) => entry.studentId)
    .filter((id) => id && UUID_PATTERN.test(id))));

  const { client: tenantClient, error: tenantError } = await resolveTenantClient(context, supabase, env, orgId);
  if (tenantError) {
    return respond(context, tenantError.status, tenantError.body);
  }

  // Fetch all instructors for name matching
  const { data: instructors, error: instructorsError } = await tenantClient
    .from('Instructors')
    .select('id, name, email, is_active');

  if (instructorsError) {
    context.log?.error?.('students-maintenance-import failed to fetch instructors', { message: instructorsError.message, orgId });
    return respond(context, 500, { message: 'failed_to_fetch_instructors' });
  }

  // Create instructor lookup maps (by name and by ID)
  const instructorByName = new Map();
  const instructorById = new Map();
  const activeInstructorNames = [];

  for (const instructor of instructors || []) {
    if (!instructor?.id) continue;
    instructorById.set(instructor.id, instructor);
    
    const name = normalizeString(instructor.name) || normalizeString(instructor.email);
    if (name) {
      instructorByName.set(name.toLowerCase(), instructor);
      if (instructor.is_active !== false) {
        activeInstructorNames.push(name);
      }
    }
  }

  // Fetch student tags for name-to-ID lookup
  const { data: tagsSettings } = await tenantClient
    .from('Settings')
    .select('settings_value')
    .eq('key', 'student_tags')
    .maybeSingle();

  const tagByName = new Map();
  const tagById = new Map();
  if (tagsSettings?.settings_value) {
    const tags = Array.isArray(tagsSettings.settings_value) ? tagsSettings.settings_value : [];
    for (const tag of tags) {
      if (tag?.id && tag?.name) {
        tagById.set(tag.id, tag);
        tagByName.set(normalizeString(tag.name).toLowerCase(), tag.id);
      }
    }
  }

  // Validate tag mappings against catalog to prevent typos from persisting unknown IDs
  if (tagMappings.size > 0) {
    const invalidMappings = [];
    for (const [nameKey, targetTagId] of tagMappings.entries()) {
      if (!tagById.has(targetTagId)) {
        invalidMappings.push({ source: nameKey, target: targetTagId });
      }
    }
    if (invalidMappings.length > 0) {
      return respond(context, 400, {
        code: 'invalid_tag_mappings',
        message: 'Mappings must point to existing tags.',
        invalid_mappings: invalidMappings,
        available_tags: Array.from(tagById.values()).map(tag => ({ id: tag.id, name: tag.name })),
      });
    }
  }

  let existingStudents = [];
  if (validIds.length > 0) {
    const { data, error: fetchError } = await tenantClient
      .from('Students')
      .select('*')
      .in('id', validIds);

    if (fetchError) {
      context.log?.error?.('students-maintenance-import failed to fetch students', { message: fetchError.message, orgId });
      return respond(context, 500, { message: 'failed_to_fetch_students' });
    }

    existingStudents = data || [];
  }

  const existingMap = new Map();
  for (const student of existingStudents || []) {
    if (student?.id) {
      existingMap.set(student.id, student);
    }
  }

  // First pass: collect all unmatched tag names across all rows
  const unmatchedTags = new Set();
  for (const entry of stagedRows) {
    const { raw } = entry;
    const tagsInput = normalizeTagsForCsv(raw?.tags ?? raw?.Tags);
    const tags = coerceTags(tagsInput);
    if (tags.valid && tags.value) {
      for (const tagName of tags.value) {
        const tagId = tagByName.get(normalizeString(tagName).toLowerCase());
        if (!tagId) {
          unmatchedTags.add(tagName);
        }
      }
    }
  }

  // If there are unmatched tags, return them for user mapping
  if (unmatchedTags.size > 0) {
    return respond(context, 400, {
      code: 'unmatched_tags',
      message: 'חלק מהתוויות בקובץ CSV לא נמצאו בקטלוג. אנא מפה אותן לתוויות קיימות.',
      unmatched_tags: Array.from(unmatchedTags),
      available_tags: Array.from(tagById.values()).map(tag => ({ id: tag.id, name: tag.name })),
    });
  }

  const failures = [];
  const candidates = [];

  for (const entry of stagedRows) {
    const { lineNumber, studentId, raw } = entry;
    if (!studentId || !UUID_PATTERN.test(studentId)) {
      failures.push(formatFailure({
        lineNumber,
        studentId,
        name: normalizeString(raw?.name) || '',
        code: 'invalid_student_id',
        message: 'שורת ה-CSV חסרה מזהה תלמיד חוקי.',
      }));
      continue;
    }

    const existing = existingMap.get(studentId);
    if (!existing) {
      failures.push(formatFailure({
        lineNumber,
        studentId,
        name: normalizeString(raw?.name) || '',
        code: 'student_not_found',
        message: 'התלמיד לא נמצא במערכת.',
      }));
      continue;
    }

    const updates = {};
    const displayName = normalizeString(raw?.name) || existing.name || '';

    const name = normalizeString(raw?.name);
    if (name) {
      addIfChanged(updates, 'name', name, existing.name);
    }

    const national = coerceNationalId(raw?.national_id ?? raw?.NationalId ?? raw?.nationalId);
    if (national.provided) {
      if (!national.valid) {
        failures.push(formatFailure({
          lineNumber,
          studentId,
          name: displayName,
          code: 'invalid_national_id',
          message: 'תעודת הזהות אינה חוקית.',
        }));
        continue;
      }
      addIfChanged(updates, 'national_id', national.value, existing.national_id);
    }

    const contactName = coerceOptionalText(raw?.contact_name ?? raw?.ContactName ?? raw?.contactName);
    if (contactName.valid && contactName.value !== undefined && contactName.value !== null) {
      addIfChanged(updates, 'contact_name', contactName.value, existing.contact_name);
    }

    const phoneCheck = validateIsraeliPhone(raw?.contact_phone ?? raw?.phone ?? raw?.contactPhone);
    if (!phoneCheck.valid) {
      failures.push(formatFailure({
        lineNumber,
        studentId,
        name: displayName,
        code: 'invalid_contact_phone',
        message: 'מספר הטלפון אינו חוקי.',
      }));
      continue;
    }
    if (phoneCheck.value !== undefined && phoneCheck.value !== null) {
      addIfChanged(updates, 'contact_phone', phoneCheck.value, existing.contact_phone);
    }

    // Support both instructor UUID and instructor name
    const instructorInput = normalizeString(raw?.assigned_instructor_name ?? raw?.assigned_instructor_id ?? raw?.instructor_id ?? raw?.assignedInstructorId ?? raw?.instructor_name ?? raw?.instructorName);
    
    if (instructorInput) {
      let instructorId = null;
      
      // Try UUID first
      if (UUID_PATTERN.test(instructorInput)) {
        const instructor = instructorById.get(instructorInput);
        if (instructor) {
          instructorId = instructorInput;
        } else {
          failures.push(formatFailure({
            lineNumber,
            studentId,
            name: displayName,
            code: 'instructor_not_found',
            message: `מדריך עם מזהה "${instructorInput}" לא נמצא במערכת.`,
          }));
          continue;
        }
      } else {
        // Try name matching
        const instructor = instructorByName.get(instructorInput.toLowerCase());
        if (instructor) {
          instructorId = instructor.id;
          if (instructor.is_active === false) {
            failures.push(formatFailure({
              lineNumber,
              studentId,
              name: displayName,
              code: 'instructor_inactive',
              message: `המדריך "${instructorInput}" אינו פעיל. מדריכים פעילים: ${activeInstructorNames.slice(0, 5).join(', ')}${activeInstructorNames.length > 5 ? '...' : ''}`,
            }));
            continue;
          }
        } else {
          // Name not found - provide helpful error with available names
          const availableNames = activeInstructorNames.slice(0, 5).join(', ');
          failures.push(formatFailure({
            lineNumber,
            studentId,
            name: displayName,
            code: 'instructor_name_not_found',
            message: `מדריך בשם "${instructorInput}" לא נמצא. מדריכים זמינים: ${availableNames}${activeInstructorNames.length > 5 ? ' ועוד...' : ''}`,
          }));
          continue;
        }
      }
      
      if (instructorId !== undefined) {
        addIfChanged(updates, 'assigned_instructor_id', instructorId, existing.assigned_instructor_id);
      }
    }

    const defaultService = coerceOptionalText(raw?.default_service ?? raw?.service);
    if (defaultService.valid && defaultService.value !== undefined) {
      addIfChanged(updates, 'default_service', defaultService.value, existing.default_service);
    }

    const defaultDay = coerceDayOfWeek(raw?.default_day_of_week ?? raw?.day);
    if (!defaultDay.valid) {
      failures.push(formatFailure({
        lineNumber,
        studentId,
        name: displayName,
        code: 'invalid_default_day',
        message: 'יום ברירת מחדל אינו חוקי.',
      }));
      continue;
    }
    if (defaultDay.value !== undefined && defaultDay.value !== null) {
      addIfChanged(updates, 'default_day_of_week', defaultDay.value, existing.default_day_of_week);
    }

    const defaultTime = coerceSessionTime(raw?.default_session_time ?? raw?.session_time ?? raw?.sessionTime);
    if (!defaultTime.valid) {
      failures.push(formatFailure({
        lineNumber,
        studentId,
        name: displayName,
        code: 'invalid_default_session_time',
        message: 'שעת ברירת המחדל אינה חוקית.',
      }));
      continue;
    }
    if (defaultTime.value !== undefined && defaultTime.value !== null) {
      addIfChanged(updates, 'default_session_time', defaultTime.value, existing.default_session_time);
    }

    const notes = coerceOptionalText(raw?.notes ?? raw?.Notes);
    if (notes.valid && notes.value !== undefined) {
      addIfChanged(updates, 'notes', notes.value, existing.notes);
    }

    const tagsInput = normalizeTagsForCsv(raw?.tags ?? raw?.Tags);
    const tags = coerceTags(tagsInput);
    if (!tags.valid) {
      failures.push(formatFailure({
        lineNumber,
        studentId,
        name: displayName,
        code: 'invalid_tags',
        message: 'תוויות אינן חוקיות.',
      }));
      continue;
    }
    // Convert tag names to IDs using lookup map, with fallback to user mappings
    if (tags.value !== undefined && tags.value !== null) {
      const tagIds = tags.value
        .map((tagName) => {
          const normalizedName = normalizeString(tagName).toLowerCase();
          // Try direct lookup first
          return tagByName.get(normalizedName) || tagMappings.get(normalizedName) || null;
        })
        .filter(Boolean); // Filter out null values for unmatched tags
      if (tags.value.length > 0 && tagIds.length === 0) {
        // All provided tags were invalid
        failures.push(formatFailure({
          lineNumber,
          studentId,
          name: displayName,
          code: 'invalid_tags',
          message: 'אף תווית מסופקת לא נמצאה בקטלוג התוויות.',
        }));
        continue;
      }
      addIfChanged(updates, 'tags', tagIds.length ? tagIds : null, existing.tags);
    }

    const isActive = coerceBooleanFlag(raw?.is_active ?? raw?.active ?? raw?.status, { defaultValue: existing.is_active, allowUndefined: true });
    if (!isActive.valid) {
      failures.push(formatFailure({
        lineNumber,
        studentId,
        name: displayName,
        code: 'invalid_is_active',
        message: 'ערך הפעילות אינו חוקי.',
      }));
      continue;
    }
    if (isActive.provided) {
      addIfChanged(updates, 'is_active', isActive.value, existing.is_active);
    }

    const desiredNationalId = Object.prototype.hasOwnProperty.call(updates, 'national_id')
      ? updates.national_id
      : existing.national_id;
    candidates.push({
      lineNumber,
      studentId,
      displayName,
      updates,
      existing,
      desiredNationalId,
    });
  }

  const nationalConflicts = new Set();
  const nationalMap = new Map();
  for (const candidate of candidates) {
    if (!candidate.desiredNationalId) {
      continue;
    }
    const existing = nationalMap.get(candidate.desiredNationalId);
    if (existing && existing.studentId !== candidate.studentId) {
      nationalConflicts.add(candidate.studentId);
      nationalConflicts.add(existing.studentId);
    } else {
      nationalMap.set(candidate.desiredNationalId, candidate);
    }
  }

  if (nationalConflicts.size > 0) {
    for (const candidate of candidates) {
      if (nationalConflicts.has(candidate.studentId)) {
        failures.push(formatFailure({
          lineNumber: candidate.lineNumber,
          studentId: candidate.studentId,
          name: candidate.displayName,
          code: 'duplicate_national_id_in_file',
          message: 'קיימת התנגשות תעודת זהות בקובץ הייבוא.',
        }));
      }
    }
  }

  const filteredCandidates = candidates.filter((candidate) => !nationalConflicts.has(candidate.studentId));
  const nationalIdsToCheck = Array.from(new Set(
    filteredCandidates
      .filter((candidate) => candidate.desiredNationalId && candidate.desiredNationalId !== candidate.existing.national_id)
      .map((candidate) => candidate.desiredNationalId),
  ));

  if (nationalIdsToCheck.length) {
    const { data: conflicts, error: nationalLookupError } = await tenantClient
      .from('Students')
      .select('id, name, national_id')
      .in('national_id', nationalIdsToCheck);

    if (nationalLookupError) {
      context.log?.error?.('students-maintenance-import failed to validate national ids', { message: nationalLookupError.message, orgId });
      return respond(context, 500, { message: 'failed_to_validate_national_id' });
    }

    const conflictMap = new Map();
    for (const conflict of conflicts || []) {
      if (conflict?.national_id) {
        conflictMap.set(conflict.national_id, conflict);
      }
    }

    for (const candidate of filteredCandidates) {
      if (!candidate.desiredNationalId) continue;
      const conflict = conflictMap.get(candidate.desiredNationalId);
      if (conflict && conflict.id !== candidate.studentId) {
        failures.push(formatFailure({
          lineNumber: candidate.lineNumber,
          studentId: candidate.studentId,
          name: candidate.displayName,
          code: 'duplicate_national_id',
          message: 'תעודת הזהות כבר קיימת אצל תלמיד אחר.',
        }));
      }
    }
  }

  const blockedIds = new Set(failures.map((failure) => failure.student_id));
  const actionableCandidates = filteredCandidates.filter((candidate) => !blockedIds.has(candidate.studentId));

  const successes = [];
  for (const candidate of actionableCandidates) {
    const { updates, studentId, displayName, existing } = candidate;
    if (!updates || Object.keys(updates).length === 0) {
      successes.push({ student_id: studentId, name: displayName, changed_fields: [] });
      continue;
    }

    const updatedMetadata = {
      ...(existing.metadata || {}),
      updated_by: userId,
      updated_at: new Date().toISOString(),
      updated_role: role,
    };

    const payload = { ...updates, metadata: updatedMetadata };

    const { error: updateError } = await tenantClient
      .from('Students')
      .update(payload)
      .eq('id', studentId);

    if (updateError) {
      failures.push(formatFailure({
        lineNumber: candidate.lineNumber,
        studentId,
        name: displayName,
        code: 'update_failed',
        message: 'עדכון התלמיד נכשל.',
      }));
      continue;
    }

    successes.push({
      student_id: studentId,
      name: displayName,
      changed_fields: Object.keys(updates),
    });
  }

  return respond(context, 200, {
    total_rows: stagedRows.length,
    updated_count: successes.length,
    failed_count: failures.length,
    updated: successes,
    failed: failures,
  });
}
