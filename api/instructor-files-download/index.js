/* eslint-env node */
/**
 * Instructor Files Download API
 * 
 * Generates presigned download URLs for instructor files.
 * 
 * GET /api/instructor-files-download?org_id=...&instructor_id=...&file_id=...
 */

import { resolveBearerAuthorization } from '../_shared/http.js';
import { createSupabaseAdminClient, readSupabaseAdminConfig } from '../_shared/supabase-admin.js';
import {
  ensureMembership,
  isAdminRole,
  readEnv,
  respond,
  resolveTenantClient,
} from '../_shared/org-bff.js';
import { getStorageDriver } from '../cross-platform/storage-drivers/index.js';
import { decryptStorageProfile } from '../_shared/storage-encryption.js';

export default async function (context, req) {
  context.log?.info?.('📥 [INSTRUCTOR-DOWNLOAD] Request received', { 
    method: req.method,
    query: req.query 
  });
  
  try {
    
    if (req.method !== 'GET') {
      return respond(context, 405, { message: 'method_not_allowed' });
    }

  const env = readEnv(context);
  const adminConfig = readSupabaseAdminConfig(env);
  if (!adminConfig.supabaseUrl || !adminConfig.serviceRoleKey) {
    context.log?.error?.('instructor-files-download missing Supabase admin credentials');
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
    context.log?.error?.('instructor-files-download failed to validate token', { message: error?.message });
    return respond(context, 401, { message: 'invalid_or_expired_token' });
  }

  if (authResult.error || !authResult.data?.user?.id) {
    return respond(context, 401, { message: 'invalid_or_expired_token' });
  }

  const userId = authResult.data.user.id;

  // Parse query parameters
  const orgId = req.query.org_id;
  const instructorId = req.query.instructor_id;
  const fileId = req.query.file_id;
  const isPreview = req.query.preview === 'true'; // Preview mode for inline viewing

  if (!orgId || !instructorId || !fileId) {
    return respond(context, 400, { message: 'missing_required_parameters' });
  }

  // Verify membership
  let role;
  try {
    role = await ensureMembership(controlClient, orgId, userId);
  } catch (membershipError) {
    context.log?.error?.('instructor-files-download failed to verify membership', {
      message: membershipError?.message,
      orgId,
      userId,
    });
    return respond(context, 500, { message: 'failed_to_verify_membership' });
  }

  if (!role) {
    return respond(context, 403, { message: 'not_a_member' });
  }

  const isAdmin = isAdminRole(role);

  // Permission check: Non-admin users can only download their own files
  if (!isAdmin && instructorId !== userId) {
    context.log?.warn?.('🚫 [INSTRUCTOR-DOWNLOAD] Permission denied', {
      userId,
      instructorId,
      isAdmin
    });
    return respond(context, 403, { message: 'forbidden', details: 'You can only access your own files' });
  }

  context.log?.info?.('✅ [INSTRUCTOR-DOWNLOAD] Permission check passed', {
    userId,
    instructorId,
    isAdmin
  });

  // Get storage profile
  const { data: orgSettings, error: settingsError } = await controlClient
    .from('org_settings')
    .select('storage_profile, permissions')
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

  // Handle disconnected storage
  if (decryptedProfile.disconnected === true) {
    // For BYOS: Allow read-only access if user still has access to their storage
    // For managed: Only allow during grace period (check storage_access_level)
    if (decryptedProfile.mode === 'managed') {
      const accessLevel = orgSettings?.permissions?.storage_access_level;
      if (accessLevel !== 'read_only_grace') {
        return respond(context, 403, { 
          message: 'storage_disconnected',
          details: 'Storage is disconnected. Downloads are not available.'
        });
      }
    }
    // BYOS continues - user owns the storage
  }

  // Get tenant client to find the file
  const { client: tenantClient, error: tenantError } = await resolveTenantClient(context, controlClient, env, orgId);
  if (tenantError) {
    return respond(context, tenantError.status, tenantError.body);
  }

  // Fetch instructor to get file metadata and instructor name
  context.log?.info?.('🔍 [INSTRUCTOR-DOWNLOAD] Fetching instructor', { instructorId });
  
  const { data: instructor, error: fetchError } = await tenantClient
    .from('Instructors')
    .select('name, files')
    .eq('id', instructorId)
    .single();

  if (fetchError) {
    context.log?.error?.('❌ [INSTRUCTOR-DOWNLOAD] Failed to fetch instructor', { 
      message: fetchError.message,
      instructorId 
    });
    return respond(context, 500, { message: 'failed_to_fetch_instructor' });
  }

  const files = Array.isArray(instructor?.files) ? instructor.files : [];
  const file = files.find(f => f.id === fileId);

  if (!file) {
    context.log?.warn?.('❌ [INSTRUCTOR-DOWNLOAD] File not found', { 
      fileId,
      instructorId,
      totalFiles: files.length 
    });
    return respond(context, 404, { message: 'file_not_found' });
  }

  context.log?.info?.('📄 [INSTRUCTOR-DOWNLOAD] File found', {
    fileId,
    fileName: file.name,
    filePath: file.path
  });

  // Get storage driver
  let driver;
  try {
    context.log?.info?.('🔧 [INSTRUCTOR-DOWNLOAD] Creating storage driver', {
      mode: decryptedProfile.mode,
      hasR2Config: !!(env.SYSTEM_R2_ENDPOINT && env.SYSTEM_R2_BUCKET_NAME),
      hasByosConfig: !!decryptedProfile.byos
    });
    
    if (decryptedProfile.mode === 'managed') {
      driver = getStorageDriver('managed', null, env);
    } else if (decryptedProfile.mode === 'byos') {
      driver = getStorageDriver('byos', decryptedProfile.byos, env);
    } else {
      throw new Error(`Unknown storage mode: ${decryptedProfile.mode}`);
    }
    
    context.log?.info?.('✅ [INSTRUCTOR-DOWNLOAD] Storage driver created successfully');
  } catch (driverError) {
    context.log?.error?.('❌ [INSTRUCTOR-DOWNLOAD] Failed to create storage driver', { 
      message: driverError?.message,
      stack: driverError?.stack,
      mode: decryptedProfile.mode
    });
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

  // Get display filename
  let displayFilename = file.name;
  
  context.log('Download filename construction', {
    hasDefinitionId: !!file.definition_id,
    definitionId: file.definition_id,
    fileName: file.name,
    originalName: file.original_name,
    definitionName: file.definition_name,
    instructorName: instructor?.name,
  });
  
  // For files with definition_id, try to get current definition name first
  if (file.definition_id && instructor?.name) {
    try {
      // Fetch document definitions to get current name (in case definition was renamed)
      const { data: settingsData, error: settingsError } = await tenantClient
        .from('Settings')
        .select('settings_value')
        .eq('key', 'instructor_document_definitions')
        .maybeSingle();

      if (settingsError) {
        context.log.error('Failed to fetch instructor document definitions', {
          error: settingsError.message,
          code: settingsError.code,
        });
      }

      context.log('Settings query result', {
        hasData: !!settingsData,
        hasValue: !!settingsData?.settings_value,
        isArray: Array.isArray(settingsData?.settings_value),
      });

      if (settingsData?.settings_value) {
        const definitions = Array.isArray(settingsData.settings_value) ? settingsData.settings_value : [];
        const currentDef = definitions.find(d => d.id === file.definition_id);
        
        context.log('Definition lookup', {
          totalDefinitions: definitions.length,
          searchingFor: file.definition_id,
          found: !!currentDef,
          foundName: currentDef?.name,
        });
        
        // Use current definition name if exists, otherwise fall back to stored definition_name
        const defName = currentDef?.name || file.definition_name;
        if (defName) {
          displayFilename = `${defName} - ${instructor.name}`;
          context.log('Using definition-based filename', { 
            defName,
            instructorName: instructor.name,
            result: displayFilename,
          });
        }
      }
    } catch (err) {
      context.log.error('Exception while fetching definitions', {
        error: err.message,
        stack: err.stack,
      });
    }
  }
  
  context.log('Final display filename before extension check', { displayFilename });
  
  // Ensure the display name has the correct file extension
  if (displayFilename && file.original_name) {
    const hasExtension = /\.[^.]+$/.test(displayFilename);
    if (!hasExtension) {
      const extensionMatch = file.original_name.match(/\.[^.]+$/);
      if (extensionMatch) {
        displayFilename = displayFilename + extensionMatch[0];
      }
    }
  }

  context.log('Final filename for download', { 
    displayFilename,
    filePath: file.path,
  });

  // Generate presigned URL (valid for 1 hour)
  try {
    context.log?.info?.('🔗 [INSTRUCTOR-DOWNLOAD] Generating presigned URL', {
      path: file.path,
      filename: displayFilename,
      hasDriver: !!driver,
      hasGetDownloadUrl: !!(driver && typeof driver.getDownloadUrl === 'function'),
      isPreview
    });
    
    const dispositionType = isPreview ? 'inline' : 'attachment';
    const downloadUrl = await driver.getDownloadUrl(file.path, 3600, displayFilename, dispositionType);
    
    context.log?.info?.('✅ [INSTRUCTOR-DOWNLOAD] Download URL generated successfully', {
      filename: displayFilename,
      urlLength: downloadUrl?.length,
      dispositionType,
    });
    
    return respond(context, 200, { url: downloadUrl });
  } catch (error) {
    context.log?.error?.('❌ [INSTRUCTOR-DOWNLOAD] Failed to generate download URL', { 
      message: error?.message,
      stack: error?.stack,
      path: file.path,
      filename: displayFilename
    });
    return respond(context, 500, { 
      message: 'failed_to_generate_download_url',
      details: error?.message,
      error: error?.message 
    });
  }
  } catch (error) {
    context.log?.error?.('instructor-files-download: unhandled error', {
      message: error?.message,
      stack: error?.stack,
    });
    return respond(context, 500, {
      message: 'internal_error',
      error: error?.message,
    });
  }
}
