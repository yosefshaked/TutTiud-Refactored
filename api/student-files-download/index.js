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
import { decryptStorageProfile } from '../_shared/storage-encryption.js';

export default async function (context, req) {
  // Log IMMEDIATELY to confirm function is called
  context.log('===== STUDENT FILES DOWNLOAD FUNCTION INVOKED =====');
  context.log('Request method:', req.method);
  context.log('Request query:', JSON.stringify(req.query || {}));
  
  try {
    context.log('student-files-download: function started');
    
    if (req.method !== 'GET') {
      return respond(context, 405, { message: 'method_not_allowed' });
    }

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
  const isPreview = req.query.preview === 'true'; // Preview mode for member role

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

  // Member role can only preview files (not download for saving)
  // Admin/Owner can download for saving
  if (role === 'member' && !isPreview) {
    context.log?.warn?.('Member role attempted to download file without preview flag', { userId, orgId, studentId, fileId });
    return respond(context, 403, { message: 'insufficient_permissions', details: 'Only administrators and owners can download student files. Use preview mode instead.' });
  }

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

  // Fetch student to get file metadata and student name
  const { data: student, error: fetchError } = await tenantClient
    .from('Students')
    .select('name, files')
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
    if (decryptedProfile.mode === 'managed') {
      driver = getStorageDriver('managed', {}, env);
    } else if (decryptedProfile.mode === 'byos') {
      driver = getStorageDriver('byos', decryptedProfile.byos, env);
    } else {
      throw new Error(`Unknown storage mode: ${decryptedProfile.mode}`);
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

  // Get display filename
  let displayFilename = file.name;
  
  context.log('Download filename construction', {
    hasDefinitionId: !!file.definition_id,
    definitionId: file.definition_id,
    fileName: file.name,
    originalName: file.original_name,
    definitionName: file.definition_name,
    studentName: student?.name,
  });
  
  // For files with definition_id, try to get current definition name first
  if (file.definition_id && student?.name) {
    try {
      // Fetch document definitions to get current name (in case definition was renamed)
      // Note: Settings are in the TENANT DB, not control DB
      const { data: settingsData, error: settingsError } = await tenantClient
        .from('Settings')
        .select('settings_value')
        .eq('key', 'document_definitions')
        .maybeSingle();

      if (settingsError) {
        context.log.error('Failed to fetch document definitions', {
          error: settingsError.message,
          code: settingsError.code,
        });
      }

      context.log('Settings query result', {
        hasData: !!settingsData,
        hasValue: !!settingsData?.settings_value,
        isArray: Array.isArray(settingsData?.settings_value),
        rawValue: settingsData?.settings_value ? JSON.stringify(settingsData.settings_value).substring(0, 200) : null,
      });

      if (settingsData?.settings_value) {
        const definitions = Array.isArray(settingsData.settings_value) ? settingsData.settings_value : [];
        const currentDef = definitions.find(d => d.id === file.definition_id);
        
        context.log('Definition lookup', {
          totalDefinitions: definitions.length,
          searchingFor: file.definition_id,
          found: !!currentDef,
          foundName: currentDef?.name,
          allDefinitionIds: definitions.map(d => d.id),
        });
        
        // Use current definition name if exists, otherwise fall back to stored definition_name
        const defName = currentDef?.name || file.definition_name;
        if (defName) {
          displayFilename = `${defName} - ${student.name}`;
          context.log('Using definition-based filename', { 
            defName,
            studentName: student.name,
            result: displayFilename,
          });
        } else {
          context.log.warn('Definition name not found', {
            definitionId: file.definition_id,
            hadCurrentDef: !!currentDef,
            hadStoredName: !!file.definition_name,
          });
        }
      } else {
        context.log.warn('No document_definitions settings found in tenant DB');
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
    const downloadUrl = await driver.getDownloadUrl(file.path, 3600, displayFilename);
    
    context.log('Generated presigned URL', {
      filename: displayFilename,
      urlLength: downloadUrl?.length,
      contentType: file.type,
    });
    
    return respond(context, 200, { 
      url: downloadUrl,
      contentType: file.type || 'application/octet-stream'
    });
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
