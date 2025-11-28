/**
 * Unified Documents Download API - Generate download URLs for documents
 * Replaces: /api/student-files-download, /api/instructor-files-download, /api/org-documents-download
 * 
 * GET /api/documents-download?document_id={uuid}&org_id={uuid}
 */

import { createSupabaseAdminClient } from '../_shared/supabase-admin.js';
import { decryptCredentials, checkOrgMembership } from '../_shared/org-bff.js';
import { createTenantClient } from '../_shared/supabase-tenant.js';
import { getStorageDriver } from '../_shared/storage-drivers/index.js';

export default async function handler(req) {
  if (req.method !== 'GET') {
    return { status: 405, body: { error: 'method_not_allowed' } };
  }

  const { document_id, org_id } = req.query;

  if (!document_id || !org_id) {
    return { status: 400, body: { error: 'document_id and org_id required' } };
  }

  // Auth check
  const supabase = createSupabaseAdminClient();
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return { status: 401, body: { error: 'missing_auth' } };
  }

  const token = authHeader.substring(7);
  const { data: authResult, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authResult?.user) {
    return { status: 401, body: { error: 'invalid_token' } };
  }

  const userId = authResult.user.id;

  // Membership check
  const membership = await checkOrgMembership(supabase, org_id, userId);
  if (!membership) {
    return { status: 403, body: { error: 'not_member' } };
  }

  const userRole = membership.role;
  const isAdmin = ['admin', 'owner'].includes(userRole);

  // Get tenant client
  const { data: orgSettings } = await supabase
    .from('org_settings')
    .select('db_url, db_service_role_key, storage_profile')
    .eq('organization_id', org_id)
    .single();

  if (!orgSettings?.db_url || !orgSettings?.db_service_role_key) {
    return { status: 424, body: { error: 'tenant_not_configured' } };
  }

  const decrypted = decryptCredentials(orgSettings.db_url, orgSettings.db_service_role_key);
  const tenantClient = createTenantClient(decrypted.dbUrl, decrypted.serviceRoleKey);

  // Fetch document
  const { data: document, error: fetchError } = await tenantClient
    .from('Documents')
    .select('*')
    .eq('id', document_id)
    .single();

  if (fetchError || !document) {
    return { status: 404, body: { error: 'document_not_found' } };
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
      return { status: 403, body: { error: 'members_cannot_view_org_documents' } };
    }
  }

  if (document.entity_type === 'instructor' && !isAdmin && userId !== document.entity_id) {
    return { status: 403, body: { error: 'permission_denied' } };
  }

  // Load storage profile
  const storageProfile = orgSettings.storage_profile;
  if (!storageProfile) {
    return { status: 424, body: { error: 'storage_not_configured' } };
  }

  // Initialize storage driver
  let driver;
  try {
    driver = getStorageDriver(storageProfile);
  } catch (err) {
    console.error('Storage driver initialization error:', err);
    return { status: 500, body: { error: 'storage_init_failed' } };
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
    return { status: 500, body: { error: 'url_generation_failed', details: err.message } };
  }

  // Encode filename for download header (RFC 5987)
  const ext = document.original_name.split('.').pop();
  const filenameWithExt = document.name.endsWith(`.${ext}`) ? document.name : `${document.name}.${ext}`;
  const encodedFilenameWithExt = encodeURIComponent(filenameWithExt);

  return {
    status: 200,
    body: {
      url: downloadUrl,
      filename: filenameWithExt,
      content_disposition: `attachment; filename*=UTF-8''${encodedFilenameWithExt}`
    }
  };
}
