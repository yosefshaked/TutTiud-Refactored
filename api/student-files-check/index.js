/* eslint-env node */
/**
 * Student Files Check API
 * 
 * Pre-upload duplicate check endpoint.
 * Calculates file hash and checks for duplicates across all students.
 * 
 * POST /api/student-files-check - Check for duplicate files
 */

import { resolveBearerAuthorization } from '../_shared/http.js';
import { createSupabaseAdminClient, readSupabaseAdminConfig } from '../_shared/supabase-admin.js';
import {
  ensureMembership,
  parseRequestBody,
  readEnv,
  respond,
  resolveTenantClient,
} from '../_shared/org-bff.js';
import crypto from 'crypto';
import multipart from 'parse-multipart-data';

/**
 * Calculate MD5 hash of file content for duplicate detection
 */
function calculateFileHash(buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

/**
 * Parse multipart form data
 */
function parseMultipartData(req) {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('multipart/form-data')) {
    throw new Error('Request must be multipart/form-data');
  }

  const boundaryMatch = contentType.match(/boundary=([^;]+)/);
  if (!boundaryMatch) {
    throw new Error('No boundary found in content-type');
  }

  const boundary = boundaryMatch[1];
  
  // In Azure Static Web Apps / Azure Functions v4:
  // - req.body is a string (not Buffer) for binary data
  // - We need to convert it to Buffer with 'binary' encoding to preserve byte values
  let bodyBuffer;
  if (Buffer.isBuffer(req.body)) {
    bodyBuffer = req.body;
  } else if (typeof req.body === 'string') {
    // Azure SWA sends binary data as a latin1/binary string
    bodyBuffer = Buffer.from(req.body, 'binary');
  } else {
    throw new Error(`Unexpected body type: ${typeof req.body}`);
  }
  
  const parts = multipart.parse(bodyBuffer, boundary);
  return parts;
}

export default async function (context, req) {
  if (req.method !== 'POST') {
    return respond(context, 405, { message: 'method_not_allowed' });
  }

  context.log?.info?.('student-files-check: request received');

  const env = readEnv(context);
  const adminConfig = readSupabaseAdminConfig(env);
  if (!adminConfig.supabaseUrl || !adminConfig.serviceRoleKey) {
    context.log?.error?.('student-files-check missing Supabase admin credentials');
    return respond(context, 500, { message: 'server_misconfigured' });
  }

  const authorization = resolveBearerAuthorization(req);
  if (!authorization?.token) {
    context.log?.warn?.('student-files-check missing bearer token', { 
      hasAuthHeader: !!req.headers?.authorization,
      authHeader: req.headers?.authorization?.substring(0, 20) + '...',
    });
    return respond(context, 401, { message: 'missing_bearer' });
  }

  const controlClient = createSupabaseAdminClient(adminConfig);

  // Validate token
  let authResult;
  try {
    authResult = await controlClient.auth.getUser(authorization.token);
  } catch (error) {
    context.log?.error?.('student-files-check failed to validate token', { message: error?.message });
    return respond(context, 401, { message: 'invalid_or_expired_token' });
  }

  if (authResult.error || !authResult.data?.user?.id) {
    context.log?.warn?.('student-files-check token validation failed', {
      hasError: !!authResult.error,
      errorMessage: authResult.error?.message,
      hasUser: !!authResult.data?.user,
      hasUserId: !!authResult.data?.user?.id,
    });
    return respond(context, 401, { message: 'invalid_or_expired_token' });
  }

  const userId = authResult.data.user.id;

  // Parse multipart data
  let parts;
  try {
    context.log?.info?.('Attempting to parse multipart data', {
      contentType: req.headers['content-type'],
      bodyType: typeof req.body,
      isBuffer: Buffer.isBuffer(req.body),
      bodyLength: req.body?.length || 0,
    });
    parts = parseMultipartData(req);
    context.log?.info?.('Multipart parsing successful', { partsCount: parts?.length || 0 });
  } catch (error) {
    context.log?.error?.('Failed to parse multipart data', { 
      message: error?.message,
      stack: error?.stack,
      contentType: req.headers['content-type'],
      bodyType: typeof req.body,
      isBuffer: Buffer.isBuffer(req.body),
    });
    return respond(context, 400, { message: 'invalid_multipart_data', error: error?.message });
  }

  // Extract fields
  const filePart = parts.find(p => p.filename);
  const orgIdPart = parts.find(p => p.name === 'org_id');

  if (!filePart) {
    return respond(context, 400, { message: 'no_file_provided' });
  }

  if (!orgIdPart) {
    return respond(context, 400, { message: 'missing_org_id' });
  }

  const orgId = orgIdPart.data.toString('utf8').trim();

  // Verify membership
  let role;
  try {
    role = await ensureMembership(controlClient, orgId, userId);
  } catch (membershipError) {
    context.log?.error?.('student-files-check failed to verify membership', {
      message: membershipError?.message,
      orgId,
      userId,
    });
    return respond(context, 500, { message: 'failed_to_verify_membership' });
  }

  if (!role) {
    return respond(context, 403, { message: 'not_a_member' });
  }

  // Calculate file hash
  const fileHash = calculateFileHash(filePart.data);

  // Get tenant client
  const { client: tenantClient, error: tenantError } = await resolveTenantClient(context, controlClient, env, orgId);
  if (tenantError) {
    return respond(context, tenantError.status, tenantError.body);
  }

  // Check for duplicate files across ALL students
  const { data: allStudents, error: studentsError } = await tenantClient
    .from('Students')
    .select('id, name, files');

  if (studentsError) {
    context.log?.error?.('Failed to fetch students for duplicate check', { 
      message: studentsError.message,
      code: studentsError.code,
      details: studentsError.details,
      hint: studentsError.hint,
      orgId,
    });
    return respond(context, 500, { 
      message: 'failed_to_check_duplicates',
      error: studentsError.message,
    });
  }

  // Find duplicates by hash
  const duplicates = [];
  for (const student of allStudents || []) {
    const studentFiles = Array.isArray(student.files) ? student.files : [];
    for (const file of studentFiles) {
      if (file.hash === fileHash) {
        duplicates.push({
          file_id: file.id,
          file_name: file.name,
          uploaded_at: file.uploaded_at,
          student_id: student.id,
          student_name: student.name,
        });
      }
    }
  }

  context.log?.info?.('Duplicate check completed', { 
    hash: fileHash, 
    duplicates_found: duplicates.length 
  });

  return respond(context, 200, {
    hash: fileHash,
    has_duplicates: duplicates.length > 0,
    duplicates,
  });
}
