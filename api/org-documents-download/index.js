/* eslint-env node */
/**
 * Organization Documents Download API
 * 
 * Returns public URLs for downloading organizational documents.
 * Uses public URLs directly (same as student/instructor files).
 * In the future, Cloudflare worker will handle custom domain presigned URLs.
 * 
 * GET /api/org-documents-download?org_id={org_id}&file_id={file_id}
 */

import { resolveBearerAuthorization } from '../_shared/http.js';
import { createSupabaseAdminClient, readSupabaseAdminConfig } from '../_shared/supabase-admin.js';
import {
  ensureMembership,
  readEnv,
  respond,
  resolveOrgId,
  resolveTenantClient,
} from '../_shared/org-bff.js';

/**
 * Main handler
 */
export default async function handler(context, req) {
  if (req.method !== 'GET') {
    return respond(context, 405, { message: 'method_not_allowed' });
  }

  let userId, orgId;

  try {
    // Parse authorization
    const authorization = resolveBearerAuthorization(req);
    if (!authorization?.token) {
      return respond(context, 401, { message: 'missing_bearer' });
    }

    const env = readEnv(context);

    // Create control DB client
    const supabaseAdminConfig = readSupabaseAdminConfig(env);
    const controlClient = createSupabaseAdminClient(supabaseAdminConfig, context);

    // Validate token
    let authResult;
    try {
      authResult = await controlClient.auth.getUser(authorization.token);
    } catch (error) {
      context.log?.error?.('org-documents-download failed to validate token', { message: error?.message });
      return respond(context, 401, { message: 'invalid_or_expired_token' });
    }

    if (authResult.error || !authResult.data?.user?.id) {
      return respond(context, 401, { message: 'invalid_or_expired_token' });
    }

    userId = authResult.data.user.id;

    // Parse query parameters
    const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
    orgId = url.searchParams.get('org_id');
    const fileId = url.searchParams.get('file_id');

    if (!orgId) {
      return respond(context, 400, { message: 'missing_org_id' });
    }

    if (!fileId) {
      return respond(context, 400, { message: 'missing_file_id' });
    }

    // Verify membership
    let role;
    try {
      role = await ensureMembership(controlClient, orgId, userId);
    } catch (membershipError) {
      context.log?.error?.('org-documents-download failed to verify membership', {
        message: membershipError?.message,
        orgId,
        userId,
      });
      return respond(context, 500, { message: 'failed_to_verify_membership' });
    }

    if (!role) {
      return respond(context, 403, { message: 'not_a_member' });
    }

    // Get tenant client
    const { client: tenantClient, error: tenantError } = await resolveTenantClient(context, controlClient, env, orgId);
    if (tenantError) {
      return respond(context, tenantError.status, tenantError.body);
    }

    // Load documents from Settings
    const { data: settingsData, error: loadError } = await tenantClient
      .from('Settings')
      .select('settings_value')
      .eq('key', 'org_documents')
      .maybeSingle();

    if (loadError && loadError.code !== 'PGRST116') {
      context.log?.error?.('Failed to load org documents', { message: loadError.message });
      return respond(context, 500, { message: 'failed_to_load_documents' });
    }

    const documents = settingsData?.settings_value || [];
    const file = documents.find(f => f.id === fileId);

    if (!file) {
      return respond(context, 404, { message: 'file_not_found' });
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

    // Return public URL (same approach as student/instructor files)
    // For custom domain support in the future, Cloudflare worker will handle presigned URLs
    // For now, using the stored public URL directly
    const downloadFilename = file.original_name || file.name;
    const hasExtension = downloadFilename.includes('.');
    
    // If no extension in original_name, try to add it from the file path
    let finalFilename = downloadFilename;
    if (!hasExtension && file.path) {
      const pathParts = file.path.split('.');
      if (pathParts.length > 1) {
        const extension = pathParts[pathParts.length - 1];
        finalFilename = `${downloadFilename}.${extension}`;
      }
    }

    context.log?.info?.('Org document download URL generated', {
      fileId,
      orgId,
      filename: file.name,
    });

    return respond(context, 200, { 
      url: file.url,
      filename: finalFilename,
      size: file.size,
      type: file.type,
    });

  } catch (error) {
    context.log?.error?.('Org documents download error', {
      message: error.message,
      stack: error.stack,
    });
    return respond(context, 500, { 
      message: 'internal_server_error',
      details: error.message 
    });
  }
}
