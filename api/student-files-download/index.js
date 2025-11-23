/* eslint-env node */
/**
 * Student Files Download API
 * 
 * Generates presigned download URLs for student files.
 * 
 * GET /api/student-files-download?org_id=...&student_id=...&file_id=...
 */

import { resolveBearerAuthorization } from '../_shared/http.js';
import { createSupabaseAdminClient, readSupabaseAdminConfig } from '../_shared/supabase-admin.js';
import {
  ensureMembership,
  readEnv,
  respond,
  resolveTenantClient,
} from '../_shared/org-bff.js';
import { getStorageDriver } from '../cross-platform/storage-drivers/index.js';

export default async function (context, req) {
  try {
    context.log('student-files-download: function started');
    
    if (req.method !== 'GET') {
      return respond(context, 405, { message: 'method_not_allowed' });
    }

    context.log?.info?.('student-files-download: request received');

  const env = readEnv(context);
  const adminConfig = readSupabaseAdminConfig(env);
  if (!adminConfig.supabaseUrl || !adminConfig.serviceRoleKey) {
    context.log?.error?.('student-files-download missing Supabase admin credentials');
    return respond(context, 500, { message: 'server_misconfigured' });
  }

  const authorization = resolveBearerAuthorization(req);
  if (!authorization?.token) {
    return respond(context, 401, { message: 'missing_bearer' });
  }

  const controlClient = createSupabaseAdminClient(adminConfig);

  // Validate token
  let authResult;
  try {
    authResult = await controlClient.auth.getUser(authorization.token);
  } catch (error) {
    context.log?.error?.('student-files-download failed to validate token', { message: error?.message });
    return respond(context, 401, { message: 'invalid_or_expired_token' });
  }

  if (authResult.error || !authResult.data?.user?.id) {
    return respond(context, 401, { message: 'invalid_or_expired_token' });
  }

  const userId = authResult.data.user.id;

  // Parse query parameters
  const orgId = req.query.org_id;
  const studentId = req.query.student_id;
  const fileId = req.query.file_id;

  if (!orgId || !studentId || !fileId) {
    return respond(context, 400, { message: 'missing_required_parameters' });
  }

  // Verify membership
  let role;
  try {
    role = await ensureMembership(controlClient, orgId, userId);
  } catch (membershipError) {
    context.log?.error?.('student-files-download failed to verify membership', {
      message: membershipError?.message,
      orgId,
      userId,
    });
    return respond(context, 500, { message: 'failed_to_verify_membership' });
  }

  if (!role) {
    return respond(context, 403, { message: 'not_a_member' });
  }

  // Get storage profile
  const { data: orgSettings, error: settingsError } = await controlClient
    .from('org_settings')
    .select('storage_profile')
    .eq('org_id', orgId)
    .maybeSingle();

  if (settingsError) {
    context.log?.error?.('Failed to load storage profile', { message: settingsError.message });
    return respond(context, 500, { message: 'failed_to_load_storage_profile' });
  }

  const storageProfile = orgSettings?.storage_profile;
  if (!storageProfile || !storageProfile.mode) {
    return respond(context, 400, { message: 'storage_not_configured' });
  }

  // Get tenant client to find the file
  const { client: tenantClient, error: tenantError } = await resolveTenantClient(context, controlClient, env, orgId);
  if (tenantError) {
    return respond(context, tenantError.status, tenantError.body);
  }

  // Fetch student to get file metadata
  const { data: student, error: fetchError } = await tenantClient
    .from('Students')
    .select('files')
    .eq('id', studentId)
    .single();

  if (fetchError) {
    context.log?.error?.('Failed to fetch student', { message: fetchError.message });
    return respond(context, 500, { message: 'failed_to_fetch_student' });
  }

  const files = Array.isArray(student?.files) ? student.files : [];
  const file = files.find(f => f.id === fileId);

  if (!file) {
    return respond(context, 404, { message: 'file_not_found' });
  }

  // Get storage driver
  let driver;
  try {
    if (storageProfile.mode === 'managed') {
      driver = getStorageDriver('managed', {}, env);
    } else if (storageProfile.mode === 'byos') {
      const byosConfig = storageProfile.byos_config;
      driver = getStorageDriver('byos', byosConfig, env);
    } else {
      throw new Error(`Unknown storage mode: ${storageProfile.mode}`);
    }
  } catch (driverError) {
    context.log?.error?.('Failed to create storage driver', { message: driverError?.message });
    return respond(context, 500, { 
      message: 'storage_driver_error', 
      details: driverError.message 
    });
  }

  // Check if driver supports presigned URLs
  if (typeof driver.getDownloadUrl !== 'function') {
    // Fallback: return the original URL (for storage providers that don't need presigning)
    return respond(context, 200, { url: file.url });
  }

  // Generate presigned URL (valid for 1 hour)
  try {
    const downloadUrl = await driver.getDownloadUrl(file.path, 3600);
    return respond(context, 200, { url: downloadUrl });
  } catch (error) {
    context.log?.error?.('Failed to generate download URL', { message: error?.message });
    return respond(context, 500, { message: 'failed_to_generate_download_url' });
  }
  } catch (error) {
    context.log?.error?.('student-files-download: unhandled error', {
      message: error?.message,
      stack: error?.stack,
    });
    return respond(context, 500, {
      message: 'internal_error',
      error: error?.message,
    });
  }
}
