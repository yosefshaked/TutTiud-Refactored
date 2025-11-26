/* eslint-env node */
/**
 * Organization Documents Download API
 * 
 * Returns download URLs for organizational documents using the storage driver.
 * The driver automatically handles public URLs (custom domain) or presigned URLs.
 * 
 * GET /api/org-documents-download?org_id={org_id}&file_id={file_id}&preview={true|false}
 * 
 * Query Parameters:
 * - org_id: Organization ID (required)
 * - file_id: File ID (required)
 * - preview: If true, returns URL with inline disposition (opens in browser).
 *            If false, returns URL with attachment disposition (downloads file).
 *            Default: false
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
import { decryptStorageProfile } from '../_shared/storage-encryption.js';

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
  const isPreview = url.searchParams.get('preview') === 'true';

  if (!orgId) {
    return respond(context, 400, { message: 'missing_org_id' });
  }

  if (!fileId) {
    return respond(context, 400, { message: 'missing_file_id' });
  }    // Verify membership
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

    // Decrypt BYOS credentials if present
    const decryptedProfile = decryptStorageProfile(storageProfile, env);

    // Prepare display filename
    const downloadFilename = file.original_name || file.name;
    const hasExtension = /\.[^.]+$/.test(downloadFilename);
    
    let finalFilename = downloadFilename;
    if (!hasExtension && file.path) {
      const extensionMatch = file.path.match(/\.[^.]+$/);
      if (extensionMatch) {
        finalFilename = downloadFilename + extensionMatch[0];
      }
    }

    // Determine Content-Disposition: inline for preview, attachment for download
    const dispositionType = isPreview ? 'inline' : 'attachment';

    // Get storage driver and generate download URL
    let downloadUrl;
    try {
      let driver;
      if (decryptedProfile.mode === 'managed') {
        driver = getStorageDriver('managed', null, env);
      } else if (decryptedProfile.mode === 'byos') {
        if (!decryptedProfile.byos) {
          return respond(context, 400, { message: 'byos_config_missing' });
        }
        driver = getStorageDriver('byos', decryptedProfile.byos, env);
      } else {
        return respond(context, 400, { message: 'invalid_storage_mode' });
      }

      // Driver handles URL generation (public URL if configured, presigned otherwise)
      downloadUrl = await driver.getDownloadUrl(file.path, 3600, finalFilename, dispositionType);
      
      context.log?.info?.('Generated download URL via driver', { 
        mode: decryptedProfile.mode,
        dispositionType,
        expiresIn: 3600 
      });
    } catch (driverError) {
      context.log?.error?.('Failed to generate download URL', { 
        message: driverError?.message,
        mode: decryptedProfile.mode
      });
      return respond(context, 500, { 
        message: 'failed_to_generate_download_url', 
        details: driverError.message 
      });
    }

    context.log?.info?.('Org document download URL generated', {
      fileId,
      orgId,
      filename: finalFilename,
      mode: decryptedProfile.mode,
      dispositionType,
      isPreview,
    });

    return respond(context, 200, { 
      url: downloadUrl,
      contentType: file.type || 'application/octet-stream'
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
