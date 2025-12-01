/* eslint-env node */
import Papa from 'papaparse';
import { resolveBearerAuthorization } from '../_shared/http.js';
import { createSupabaseAdminClient, readSupabaseAdminConfig } from '../_shared/supabase-admin.js';
import {
  ensureMembership,
  isAdminRole,
  normalizeString,
  readEnv,
  parseRequestBody,
  respond,
  resolveOrgId,
  resolveTenantClient,
} from '../_shared/org-bff.js';

const EXPORT_COLUMNS = [
  'system_uuid',
  'name',
  'national_id',
  'contact_name',
  'contact_phone',
  'assigned_instructor_id',
  'assigned_instructor_name',
  'default_service',
  'default_day_of_week',
  'default_session_time',
  'notes',
  'tags',
  'is_active',
];

const HEBREW_HEADERS = {
  'system_uuid': 'מזהה מערכת (UUID)',
  'name': 'שם התלמיד',
  'national_id': 'מספר זהות',
  'contact_name': 'שם איש קשר',
  'contact_phone': 'טלפון',
  'assigned_instructor_id': 'מזהה מדריך',
  'assigned_instructor_name': 'שם מדריך',
  'default_service': 'שירות ברירת מחדל',
  'default_day_of_week': 'יום ברירת מחדל',
  'default_session_time': 'שעת מפגש ברירת מחדל',
  'notes': 'הערות',
  'tags': 'תגיות',
  'is_active': 'פעיל',
};

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
  const body = parseRequestBody(null);
  const orgId = resolveOrgId(req, body);

  if (!orgId) {
    return respond(context, 400, { message: 'invalid org id' });
  }

  let role;
  try {
    role = await ensureMembership(supabase, orgId, userId);
  } catch (membershipError) {
    context.log?.error?.('students-maintenance-export failed to verify membership', {
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

  const { data: students, error: studentsError } = await tenantClient
    .from('Students')
    .select(
      'id, name, national_id, contact_name, contact_phone, assigned_instructor_id, default_service, default_day_of_week, default_session_time, notes, tags, is_active',
    )
    .order('name', { ascending: true });

  if (studentsError) {
    context.log?.error?.('students-maintenance-export failed to fetch students', { message: studentsError.message, orgId });
    return respond(context, 500, { message: 'failed_to_fetch_students' });
  }

  const { data: instructors, error: instructorsError } = await tenantClient
    .from('Instructors')
    .select('id, name, email');

  if (instructorsError) {
    context.log?.error?.('students-maintenance-export failed to fetch instructors', { message: instructorsError.message, orgId });
    return respond(context, 500, { message: 'failed_to_fetch_instructors' });
  }

  const instructorLookup = new Map();
  if (Array.isArray(instructors)) {
    for (const instructor of instructors) {
      const id = typeof instructor?.id === 'string' ? instructor.id : '';
      if (!id || instructorLookup.has(id)) continue;
      const name = normalizeString(instructor?.name) || normalizeString(instructor?.email) || id;
      instructorLookup.set(id, name);
    }
  }

  const rows = Array.isArray(students)
    ? students.map((student) => {
        const tags = Array.isArray(student?.tags) ? student.tags.filter(Boolean) : [];
        return {
          system_uuid: student.id || '',
          name: student.name || '',
          national_id: student.national_id || '',
          contact_name: student.contact_name || '',
          contact_phone: student.contact_phone || '',
          assigned_instructor_id: student.assigned_instructor_id || '',
          assigned_instructor_name: instructorLookup.get(student.assigned_instructor_id) || '',
          default_service: student.default_service || '',
          default_day_of_week: student.default_day_of_week ?? '',
          default_session_time: student.default_session_time || '',
          notes: student.notes || '',
          tags: tags.join('; '),
          is_active: student.is_active === false ? 'false' : 'true',
        };
      })
    : [];

  // Use papaparse to generate CSV with proper escaping and encoding
  const csvContent = Papa.unparse(rows, {
    columns: EXPORT_COLUMNS,
    header: true,
    newline: '\r\n', // Windows line endings for Excel
    quotes: true, // Quote fields that need it
  });
  
  // Replace English headers with Hebrew
  const lines = csvContent.split('\r\n');
  const hebrewHeader = EXPORT_COLUMNS.map(col => HEBREW_HEADERS[col] || col).join(',');
  lines[0] = hebrewHeader;
  const csvWithHebrewHeaders = lines.join('\r\n');
  
  // Add UTF-8 BOM for proper Excel encoding of Hebrew characters
  const utf8Bom = '\uFEFF';
  const csvWithBom = utf8Bom + csvWithHebrewHeaders;
  
  // Convert to Buffer to ensure proper UTF-8 encoding
  const buffer = Buffer.from(csvWithBom, 'utf8');

  const response = {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="student-data-maintenance.csv"',
    },
    body: buffer,
    isRaw: true,
  };
  
  context.res = response;
  return response;
}