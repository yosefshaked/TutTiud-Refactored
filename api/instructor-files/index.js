/* eslint-env node */
/* global Buffer */
/**
 * Instructor Files API
 * 
 * Handles file upload and deletion for instructor documents.
 * Integrates with Phase 1 storage configuration (BYOS vs Managed).
 * Follows the same pattern as student-files endpoint.
 * 
 * POST /api/instructor-files - Upload file
 * DELETE /api/instructor-files - Delete file
 */

import { resolveBearerAuthorization } from '../_shared/http.js';
import { createSupabaseAdminClient, readSupabaseAdminConfig } from '../_shared/supabase-admin.js';
import {
  ensureMembership,
  isAdminRole,
  parseRequestBody,
  readEnv,
  respond,
  resolveOrgId,
  resolveTenantClient,
} from '../_shared/org-bff.js';
import { getStorageDriver } from '../cross-platform/storage-drivers/index.js';
import { decryptStorageProfile } from '../_shared/storage-encryption.js';
import multipart from 'parse-multipart-data';
import crypto from 'crypto';

/**
 * File upload validation constants
 */
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

/**
 * Generate unique file ID
 */
function generateFileId() {
  return crypto.randomUUID();
}

/**
 * Calculate MD5 hash of file content for duplicate detection
 */
function calculateFileHash(buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

/**
 * Validate file upload
 */
function validateFileUpload(fileData, mimeType) {
  // Check file size
  if (fileData.length > MAX_FILE_SIZE) {
    return { valid: false, error: 'file_too_large', details: `Maximum file size is ${MAX_FILE_SIZE / 1024 / 1024}MB` };
  }

  // Check MIME type
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return { valid: false, error: 'invalid_file_type', details: 'File type not allowed. Allowed types: PDF, images (JPG, PNG, GIF), Word, Excel' };
  }

  return { valid: true };
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
  context.log?.info?.('instructor-files: request received', { method: req.method });

  const env = readEnv(context);
  const adminConfig = readSupabaseAdminConfig(env);
  if (!adminConfig.supabaseUrl || !adminConfig.serviceRoleKey) {
    context.log?.error?.('instructor-files missing Supabase admin credentials');
    return respond(context, 500, { message: 'server_misconfigured' });
  }

  const authorization = resolveBearerAuthorization(req);
  if (!authorization?.token) {
    context.log?.warn?.('instructor-files missing bearer token', {
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
    context.log?.error?.('instructor-files failed to validate token', { message: error?.message });
    return respond(context, 401, { message: 'invalid_or_expired_token' });
  }

  if (authResult.error || !authResult.data?.user?.id) {
    context.log?.warn?.('instructor-files token validation failed', {
      hasError: !!authResult.error,
      errorMessage: authResult.error?.message,
      hasUser: !!authResult.data?.user,
      hasUserId: !!authResult.data?.user?.id,
    });
    return respond(context, 401, { message: 'invalid_or_expired_token' });
  }

  const userId = authResult.data.user.id;

  // POST: Upload file
  if (req.method === 'POST') {
    let parts;
    try {
      parts = parseMultipartData(req);
    } catch (error) {
      context.log?.error?.('Failed to parse multipart data', { message: error?.message });
      return respond(context, 400, { message: 'invalid_multipart_data' });
    }

    // Extract fields from multipart data
    const filePart = parts.find(p => p.filename);
    const instructorIdPart = parts.find(p => p.name === 'instructor_id');
    const orgIdPart = parts.find(p => p.name === 'org_id');
    const defIdPart = parts.find(p => p.name === 'definition_id');
    const defNamePart = parts.find(p => p.name === 'definition_name');

    if (!filePart) {
      return respond(context, 400, { message: 'no_file_provided' });
    }

    if (!instructorIdPart || !orgIdPart) {
      return respond(context, 400, { message: 'missing_instructor_id_or_org_id' });
    }

    const instructorId = instructorIdPart.data.toString('utf8').trim();
    const orgId = orgIdPart.data.toString('utf8').trim();
    const definitionId = defIdPart ? defIdPart.data.toString('utf8').trim() : null;
    const definitionName = defNamePart ? defNamePart.data.toString('utf8').trim() : null;

    // Decode filename properly to handle Hebrew and other UTF-8 characters
    let decodedFilename = filePart.filename;
    
    context.log?.info?.('Filename encoding debug', {
      original: filePart.filename,
      codePoints: filePart.filename ? Array.from(filePart.filename).map(c => c.charCodeAt(0).toString(16)) : [],
      length: filePart.filename?.length,
    });

    try {
      // Hebrew characters sent as UTF-8 bytes but interpreted as latin1/windows-1252
      if (decodedFilename && /[\u0080-\u00FF]/.test(decodedFilename)) {
        const originalBytes = Buffer.from(decodedFilename, 'latin1');
        const utf8Decoded = originalBytes.toString('utf8');
        
        if (!utf8Decoded.includes('\uFFFD')) {
          context.log?.info?.('Successfully decoded Hebrew filename', {
            before: decodedFilename,
            after: utf8Decoded,
          });
          decodedFilename = utf8Decoded;
        }
      }
    } catch (err) {
      context.log?.warn?.('Failed to decode filename, using original', { 
        error: err.message,
        filename: decodedFilename,
      });
    }

    context.log?.info?.('File upload parsed', {
      filename: decodedFilename,
      mimeType: filePart.type,
      fileSize: filePart.data.length,
      instructorId,
      orgId,
    });

    // Validate file
    const validation = validateFileUpload(filePart.data, filePart.type);
    if (!validation.valid) {
      context.log?.warn?.('File validation failed', { error: validation.error, details: validation.details });
      return respond(context, 400, { 
        message: validation.error,
        details: validation.details 
      });
    }

    // Verify membership
    let role;
    try {
      role = await ensureMembership(controlClient, orgId, userId);
    } catch (membershipError) {
      context.log?.error?.('instructor-files failed to verify membership', {
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

    // Permission check: Non-admin users can only upload to their own instructor record
    if (!isAdmin && instructorId !== userId) {
      return respond(context, 403, { 
        message: 'forbidden',
        details: 'You can only upload files to your own instructor record'
      });
    }

    // Get storage profile from org_settings
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

    // Block uploads if storage is disconnected
    if (decryptedProfile.disconnected === true) {
      return respond(context, 403, { 
        message: 'storage_disconnected',
        details: 'Storage is disconnected. Please reconnect or reconfigure storage to upload files.'
      });
    }

    // Calculate file hash for deduplication tracking
    const fileHash = calculateFileHash(filePart.data);

    // Generate file metadata
    const fileId = generateFileId();
    const filenameParts = filePart.filename.split('.');
    const extension = filenameParts.length > 1 && filenameParts[filenameParts.length - 1] 
      ? filenameParts[filenameParts.length - 1] 
      : 'bin';
    // Build storage path with proper structure: managed/org-id/instructors/instructor-id/file
    const mode = decryptedProfile.mode;
    const filePath = mode === 'managed' 
      ? `managed/${orgId}/instructors/${instructorId}/${fileId}.${extension}`
      : `${orgId}/instructors/${instructorId}/${fileId}.${extension}`;
    const contentType = filePart.type || 'application/octet-stream';

    // Get storage driver
    let driver;
    try {
      if (decryptedProfile.mode === 'managed') {
        // Check for required R2 environment variables
        const hasR2Config = env.SYSTEM_R2_ENDPOINT && env.SYSTEM_R2_ACCESS_KEY && 
                           env.SYSTEM_R2_SECRET_KEY && env.SYSTEM_R2_BUCKET_NAME;
        if (!hasR2Config) {
          context.log?.error?.('Managed storage R2 environment variables not configured');
          return respond(context, 500, { 
            message: 'managed_storage_not_configured',
            details: 'System administrator needs to configure R2 storage credentials'
          });
        }
        driver = getStorageDriver('managed', null, env);
      } else if (decryptedProfile.mode === 'byos') {
        if (!decryptedProfile.byos) {
          return respond(context, 400, { message: 'byos_config_missing' });
        }
        driver = getStorageDriver('byos', decryptedProfile.byos, env);
      } else {
        return respond(context, 400, { message: 'invalid_storage_mode' });
      }
    } catch (driverError) {
      context.log?.error?.('Failed to create storage driver', { 
        message: driverError?.message,
        stack: driverError?.stack,
        mode: storageProfile.mode
      });
      return respond(context, 500, { 
        message: 'storage_driver_error', 
        details: driverError.message 
      });
    }

    // Upload file
    let uploadResult;
    try {
      uploadResult = await driver.upload(filePath, filePart.data, contentType);
    } catch (uploadError) {
      context.log?.error?.('File upload failed', { message: uploadError?.message });
      return respond(context, 500, { message: 'file_upload_failed', error: uploadError.message });
    }

    // Get tenant client for database update
    const { client: tenantClient, error: tenantError } = await resolveTenantClient(context, controlClient, env, orgId);
    if (tenantError) {
      return respond(context, tenantError.status, tenantError.body);
    }

    // CRITICAL: Verify instructor record exists BEFORE uploading to storage
    // This ensures the instructorId actually corresponds to an instructor in the system
    const { data: currentInstructor, error: fetchError } = await tenantClient
      .from('Instructors')
      .select('id, name, files')
      .eq('id', instructorId)
      .single();

    if (fetchError || !currentInstructor) {
      context.log?.error?.('Instructor not found or fetch failed', { 
        message: fetchError?.message,
        code: fetchError?.code,
        instructorId,
        orgId,
      });
      return respond(context, 404, { 
        message: 'instructor_not_found',
        details: 'The specified instructor does not exist in this organization'
      });
    }

    // Build proper display name based on definition and instructor
    let displayName = decodedFilename;
    
    if (definitionId && definitionName) {
      const instructorName = currentInstructor?.name || 'מדריך';
      displayName = `${definitionName} - ${instructorName}`;
      
      context.log?.info?.('Built display name for instructor file', {
        definitionName,
        instructorName,
        displayName,
      });
    }

    // Build complete file metadata object
    const completeFileMetadata = {
      id: fileId,
      name: displayName,
      original_name: decodedFilename,
      url: uploadResult.url,
      path: filePath,
      storage_provider: storageProfile.mode,
      uploaded_at: new Date().toISOString(),
      uploaded_by: userId,
      definition_id: definitionId || null,
      ...(definitionName && { definition_name: definitionName }),
      size: filePart.data.length,
      type: contentType,
      hash: fileHash,
    };

    const currentFiles = Array.isArray(currentInstructor?.files) ? currentInstructor.files : [];
    const updatedFiles = [...currentFiles, completeFileMetadata];

    // Update instructor record
    const { error: updateError } = await tenantClient
      .from('Instructors')
      .update({ files: updatedFiles })
      .eq('id', instructorId);

    if (updateError) {
      context.log?.error?.('Failed to update instructor files', { message: updateError.message });
      return respond(context, 500, { message: 'failed_to_update_instructor' });
    }

    context.log?.info?.('File uploaded successfully', { fileId, instructorId, mode: storageProfile.mode });

    return respond(context, 200, {
      file: completeFileMetadata,
    });
  }

  // DELETE: Remove file
  if (req.method === 'DELETE') {
    const body = parseRequestBody(req);
    const orgId = resolveOrgId(req, body);
    const { instructor_id: instructorId, file_id: fileId } = body;

    if (!orgId || !instructorId || !fileId) {
      return respond(context, 400, { message: 'missing_required_fields' });
    }

    // Verify membership
    let role;
    try {
      role = await ensureMembership(controlClient, orgId, userId);
    } catch (membershipError) {
      context.log?.error?.('instructor-files failed to verify membership', {
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

    // Permission check: Non-admin users cannot delete files (even their own)
    if (!isAdmin) {
      return respond(context, 403, { 
        message: 'forbidden',
        details: 'File deletion is restricted to administrators only'
      });
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

    // Get tenant client
    const { client: tenantClient, error: tenantError } = await resolveTenantClient(context, controlClient, env, orgId);
    if (tenantError) {
      return respond(context, tenantError.status, tenantError.body);
    }
    
    // Fetch current files array
    const { data: instructor, error: fetchError } = await tenantClient
      .from('Instructors')
      .select('files')
      .eq('id', instructorId)
      .single();

    if (fetchError) {
      context.log?.error?.('Failed to fetch instructor', { message: fetchError.message });
      return respond(context, 500, { message: 'failed_to_fetch_instructor' });
    }

    const currentFiles = Array.isArray(instructor?.files) ? instructor.files : [];
    const fileToDelete = currentFiles.find(f => f.id === fileId);

    if (!fileToDelete) {
      return respond(context, 404, { message: 'file_not_found' });
    }

    // Get storage driver
    let driver;
    try {
      if (storageProfile.mode === 'managed') {
        driver = getStorageDriver('managed', null, env);
      } else if (storageProfile.mode === 'byos') {
        if (!storageProfile.byos) {
          context.log?.warn?.('BYOS config missing, skipping physical deletion');
        } else {
          driver = getStorageDriver('byos', storageProfile.byos, env);
        }
      }
    } catch (driverError) {
      context.log?.warn?.('Failed to create storage driver for deletion', { message: driverError?.message });
      // Continue to remove from database even if driver creation fails
    }

    // Delete physical file
    if (driver && fileToDelete.path) {
      try {
        await driver.delete(fileToDelete.path);
        context.log?.info?.('Physical file deleted', { path: fileToDelete.path });
      } catch (deleteError) {
        context.log?.warn?.('Failed to delete physical file', { message: deleteError?.message });
        // Continue to remove from database even if physical deletion fails
      }
    }

    // Remove from files array
    const updatedFiles = currentFiles.filter(f => f.id !== fileId);

    // Update instructor record
    const { error: updateError } = await tenantClient
      .from('Instructors')
      .update({ files: updatedFiles })
      .eq('id', instructorId);

    if (updateError) {
      context.log?.error?.('Failed to update instructor files', { message: updateError.message });
      return respond(context, 500, { message: 'failed_to_update_instructor' });
    }

    context.log?.info?.('File deleted successfully', { fileId, instructorId });

    return respond(context, 200, { success: true });
  }

  return respond(context, 405, { message: 'method_not_allowed' });
}
