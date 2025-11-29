/**
 * Unified Documents Download API - Generate download URLs for documents
 * Replaces: /api/student-files-download, /api/instructor-files-download, /api/org-documents-download
 * 
 * GET /api/documents-download?document_id={uuid}&org_id={uuid}
 */

import { createSupabaseAdminClient, readSupabaseAdminConfig } from '../_shared/supabase-admin.js';
import { ensureMembership, resolveTenantClient, readEnv } from '../_shared/org-bff.js';
import { getStorageDriver } from '../cross-platform/storage-drivers/index.js';
import { resolveBearerAuthorization, respond } from '../_shared/http.js';

export default async function handler(context, req) {
  try {
    if (req.method !== 'GET') {
      return respond(context, 405, { error: 'method_not_allowed' });
    }

    const { document_id, org_id } = req.query;

    if (!document_id || !org_id) {
      return respond(context, 400, { error: 'document_id and org_id required' });
    }

    // Read environment and create Supabase admin client
    const env = readEnv(context);
    const adminConfig = readSupabaseAdminConfig(env);

    if (!adminConfig?.supabaseUrl || !adminConfig?.serviceRoleKey) {
      context.log?.error?.('documents-download missing Supabase admin credentials');
      return respond(context, 500, { error: 'server_misconfigured' });
    }

  // Auth check
  const supabase = createSupabaseAdminClient(adminConfig);
  const authorization = resolveBearerAuthorization(req);
  if (!authorization?.token) {
    return respond(context, 401, { error: 'missing_auth' });
  }

  const token = authorization.token;
  const authResult = await supabase.auth.getUser(token);
  if (authResult.error || !authResult.data?.user?.id) {
    return respond(context, 401, { error: 'invalid_token' });
  }

  const userId = authResult.data.user.id;

  // Membership check
  let role;
  try {
    role = await ensureMembership(supabase, org_id, userId);
  } catch (membershipError) {
    context.log?.error?.('documents-download failed to verify membership', {
      message: membershipError?.message,
      org_id,
      userId,
    });
    return respond(context, 500, { error: 'failed_to_verify_membership' });
  }

  if (!role) {
    return respond(context, 403, { error: 'not_member' });
  }

  const userRole = role;
  const isAdmin = ['admin', 'owner'].includes(userRole);

  // Get tenant client
  const tenantResult = await resolveTenantClient(context, supabase, env, org_id);
  if (tenantResult.error) {
    return respond(context, 424, { error: 'tenant_not_configured', details: tenantResult.error });
  }
  const tenantClient = tenantResult.client;

  // Get storage profile
  const { data: orgSettings, error: orgSettingsError } = await supabase
    .from('org_settings')
    .select('storage_profile')
    .eq('org_id', org_id)
    .single();

  if (orgSettingsError || !orgSettings) {
    context.log?.error?.('documents-download failed to fetch org settings', {
      error: orgSettingsError?.message,
      org_id
    });
    return respond(context, 424, { error: 'org_settings_not_found' });
  }

  // Fetch document
  const { data: document, error: fetchError } = await tenantClient
    .from('Documents')
    .select('*')
    .eq('id', document_id)
    .single();

  if (fetchError || !document) {
    return respond(context, 404, { error: 'document_not_found' });
  }

  // Permission validation
  if (document.entity_type === 'organization' && !isAdmin) {
    // Check org_documents_member_visibility setting
    const { data: visibilitySetting } = await tenantClient
      .from('Settings')
      .select('settings_value')
      .eq('key', 'org_documents_member_visibility')
      .single();

    const memberVisibility = visibilitySetting?.settings_value?.enabled || false;
    if (!memberVisibility) {
      return respond(context, 403, { error: 'members_cannot_view_org_documents' });
    }
  }

  if (document.entity_type === 'instructor' && !isAdmin && userId !== document.entity_id) {
    return respond(context, 403, { error: 'permission_denied' });
  }

  // Load storage profile
  const storageProfile = orgSettings.storage_profile;
  if (!storageProfile) {
    return respond(context, 424, { error: 'storage_not_configured' });
  }

  // Initialize storage driver
  let driver;
  try {
    driver = getStorageDriver(storageProfile);
  } catch (err) {
    console.error('Storage driver initialization error:', err);
    return respond(context, 500, { error: 'storage_init_failed' });
  }

  // Generate download URL
  let downloadUrl;
  try {
    // For managed storage, use public URL directly (Cloudflare worker will handle presigned URLs later)
    // For BYOS, generate presigned URL
    if (storageProfile.mode === 'managed') {
      const endpoint = storageProfile.endpoint;
      const bucket = storageProfile.bucket;
      downloadUrl = `${endpoint}/${bucket}/${document.path}`;
    } else {
      downloadUrl = await driver.getPublicUrl(document.path);
    }
  } catch (err) {
    console.error('URL generation error:', err);
    return respond(context, 500, { error: 'url_generation_failed', details: err.message });
  }

  // Encode filename for download header (RFC 5987)
  const ext = document.original_name.split('.').pop();
  const filenameWithExt = document.name.endsWith(`.${ext}`) ? document.name : `${document.name}.${ext}`;
  const encodedFilenameWithExt = encodeURIComponent(filenameWithExt);

  return respond(context, 200, {
    url: downloadUrl,
    filename: filenameWithExt,
    content_disposition: `attachment; filename*=UTF-8''${encodedFilenameWithExt}`
  });
  } catch (error) {
    console.error('[ERROR] documents-download unhandled exception:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      document_id: req.query?.document_id,
      org_id: req.query?.org_id
    });
    context.log?.error?.('documents-download unhandled exception', {
      message: error.message,
      stack: error.stack
    });
    return respond(context, 500, { 
      error: 'internal_error', 
      details: error.message,
      type: error.name 
    });
  }
}
