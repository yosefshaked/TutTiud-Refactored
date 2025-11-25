/* eslint-env node */
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
  
  let bodyBuffer;
  if (Buffer.isBuffer(req.body)) {
    bodyBuffer = req.body;
  } else if (typeof req.body === 'string') {
    bodyBuffer = Buffer.from(req.body, 'binary');
  } else {
    throw new Error('Unexpected request body type');
  }

  const parts = multipart.parse(bodyBuffer, boundary);
  return parts;
}

/**
 * Decode UTF-8 filenames that may have been mis-encoded as latin1
 */
function decodeFilename(filename) {
  try {
    // Try to detect if filename was mis-encoded (contains non-ASCII that looks like mojibake)
    const hasHighBytes = /[\x80-\xFF]/.test(filename);
    if (hasHighBytes) {
      // Convert back to bytes and decode as UTF-8
      const bytes = Buffer.from(filename, 'latin1');
      return bytes.toString('utf8');
    }
    return filename;
  } catch {
    return filename;
  }
}

/**
 * Main request handler
 */
export default async function (context, req) {
  context.log?.info?.('🚀 Test log from instructor-files!');

  const { method } = req;

  if (method === 'POST') {
    return await handleUpload(context, req);
  } else if (method === 'DELETE') {
    return await handleDelete(context, req);
  } else {
    return respond(context, 405, { error: 'method_not_allowed' });
  }
}

/**
 * POST /api/instructor-files - Upload file
 */
async function handleUpload(context, req) {
  let tenantClient = null;

  try {
    console.log('\n\n🚀🚀🚀 [INSTRUCTOR-FILES] ===== UPLOAD STARTED ===== 🚀🚀🚀\n');
    context.log?.info?.('🚀🚀🚀 INSTRUCTOR FILE UPLOAD STARTED 🚀🚀🚀');
    console.log('🔵 [INSTRUCTOR-FILES] Upload started');
    
    // Parse auth and resolve org
    const bearer = resolveBearerAuthorization(req);
    if (!bearer) {
      console.error('❌ [INSTRUCTOR-FILES] Missing authorization header');
      return respond(context, 401, { error: 'missing_authorization' });
    }

    console.log('🔵 [INSTRUCTOR-FILES] Bearer token found');

    const env = readEnv(context);
    const adminConfig = readSupabaseAdminConfig(env);
    const controlClient = createSupabaseAdminClient(adminConfig);

    console.log('🔵 [INSTRUCTOR-FILES] Control client created');

    // Verify session
    const { data: { user }, error: authError } = await controlClient.auth.getUser(bearer);
    if (authError || !user) {
      console.error('❌ [INSTRUCTOR-FILES] Auth failed:', authError?.message);
      return respond(context, 401, { error: 'invalid_token' });
    }

    console.log('🔵 [INSTRUCTOR-FILES] User authenticated:', user.id);
    context.log?.info?.(`✅ User authenticated: ${user.id}`);

    const orgId = resolveOrgId(req);
    if (!orgId) {
      console.error('❌ [INSTRUCTOR-FILES] Missing org_id');
      return respond(context, 400, { error: 'missing_org_id' });
    }

    console.log('🔵 [INSTRUCTOR-FILES] Org ID:', orgId);

    // Ensure user is a member
    const role = await ensureMembership(controlClient, orgId, user.id);
    if (!role) {
      console.error('❌ [INSTRUCTOR-FILES] User not a member of org');
      return respond(context, 403, { error: 'not_org_member' });
    }

    const isAdmin = isAdminRole(role);
    console.log('🔵 [INSTRUCTOR-FILES] User role:', role, 'isAdmin:', isAdmin);

    // Get storage profile
    const { data: orgSettings, error: settingsError } = await controlClient
      .from('org_settings')
      .select('storage_profile')
      .eq('org_id', orgId)
      .single();

    if (settingsError || !orgSettings?.storage_profile) {
      console.error('❌ [INSTRUCTOR-FILES] Storage not configured:', settingsError?.message);
      return respond(context, 424, { error: 'storage_not_configured' });
    }

    const storageProfile = orgSettings.storage_profile;
    console.log('🔵 [INSTRUCTOR-FILES] Storage profile loaded. Mode:', storageProfile.mode);

    // Check if storage is disconnected
    if (storageProfile.disconnected === true) {
      console.error('❌ [INSTRUCTOR-FILES] Storage is disconnected');
      return respond(context, 403, { error: 'storage_disconnected', message: 'Storage is disconnected. Please reconnect storage to upload files.' });
    }

    // Decrypt BYOS credentials if needed
    let resolvedProfile = storageProfile;
    if (storageProfile.mode === 'byos' && storageProfile.byos) {
      const decrypted = decryptStorageProfile(storageProfile);
      resolvedProfile = { ...storageProfile, byos: decrypted.byos };
      console.log('🔵 [INSTRUCTOR-FILES] BYOS credentials decrypted');
    }

    // Get environment variables for managed storage
    const r2Env = {
      SYSTEM_R2_ENDPOINT: process.env.SYSTEM_R2_ENDPOINT,
      SYSTEM_R2_ACCESS_KEY: process.env.SYSTEM_R2_ACCESS_KEY,
      SYSTEM_R2_SECRET_KEY: process.env.SYSTEM_R2_SECRET_KEY,
      SYSTEM_R2_BUCKET_NAME: process.env.SYSTEM_R2_BUCKET_NAME,
    };

    console.log('🔵 [INSTRUCTOR-FILES] Environment variables loaded. Has R2 config:', !!(r2Env.SYSTEM_R2_ENDPOINT && r2Env.SYSTEM_R2_BUCKET_NAME));

    // Parse multipart data
    const parts = parseMultipartData(req);
    console.log('🔵 [INSTRUCTOR-FILES] Multipart data parsed. Parts count:', parts.length);

    // Extract fields
    const filePart = parts.find(p => p.name === 'file');
    const instructorIdPart = parts.find(p => p.name === 'instructor_id');
    const definitionIdPart = parts.find(p => p.name === 'definition_id');
    const definitionNamePart = parts.find(p => p.name === 'definition_name');

    if (!filePart || !instructorIdPart) {
      return respond(context, 400, { error: 'missing_required_fields', details: 'file and instructor_id are required' });
    }

    const instructorId = instructorIdPart.data.toString('utf8');
    const definitionId = definitionIdPart?.data.toString('utf8') || null;
    const definitionName = definitionNamePart?.data.toString('utf8') || null;

    // Permission check: Non-admin users can only upload to their own instructor record
    if (!isAdmin && instructorId !== user.id) {
      return respond(context, 403, { error: 'forbidden', message: 'You can only upload files to your own instructor record' });
    }

    const fileData = filePart.data;
    const rawFilename = filePart.filename || 'file';
    const originalName = decodeFilename(rawFilename);
    const mimeType = filePart.type || 'application/octet-stream';

    console.log('🔵 [INSTRUCTOR-FILES] File parsed:', { originalName, mimeType, size: fileData.length });
    context.log?.info?.(`📄 File parsed: ${originalName} (${mimeType}, ${fileData.length} bytes)`);

    // Validate file
    const validation = validateFileUpload(fileData, mimeType);
    if (!validation.valid) {
      return respond(context, 400, { error: validation.error, details: validation.details });
    }

    // Get tenant client
    tenantClient = await resolveTenantClient(controlClient, orgId);

    // Verify instructor exists
    const { data: instructor, error: instructorError } = await tenantClient
      .from('Instructors')
      .select('id, name')
      .eq('id', instructorId)
      .single();

    if (instructorError || !instructor) {
      return respond(context, 404, { error: 'instructor_not_found' });
    }

    // Generate file metadata
    const fileId = generateFileId();
    const fileHash = calculateFileHash(fileData);
    const fileExtension = originalName.split('.').pop() || '';
    const storagePath = `instructors/${orgId}/${instructorId}/${fileId}.${fileExtension}`;

    // Initialize storage driver
    let driver;
    if (resolvedProfile.mode === 'managed') {
      driver = getStorageDriver('managed', null, r2Env);
    } else if (resolvedProfile.mode === 'byos') {
      driver = getStorageDriver('byos', resolvedProfile.byos, r2Env);
    } else {
      return respond(context, 500, { error: 'invalid_storage_mode' });
    }

    console.log('🔵 [INSTRUCTOR-FILES] Uploading to storage...', { path: storagePath, size: fileData.length });
    context.log?.info?.(`📤 Uploading file to storage: ${storagePath}`);

    // Upload to storage
    await driver.upload(storagePath, fileData, mimeType);

    console.log('✅ [INSTRUCTOR-FILES] File uploaded to storage');
    context.log?.info?.('✅ File uploaded to storage successfully');

    // Get download URL for immediate access
    const url = await driver.getDownloadUrl(storagePath, 3600, originalName); // 1 hour expiry

    console.log('✅ [INSTRUCTOR-FILES] Download URL generated');
    context.log?.info?.('✅ Download URL generated');

    // Build file metadata
    const fileMetadata = {
      id: fileId,
      name: definitionName && definitionId 
        ? `${definitionName} - ${instructor.name}` 
        : originalName,
      original_name: originalName,
      url,
      path: storagePath,
      storage_provider: resolvedProfile.mode === 'managed' ? 'managed_r2' : resolvedProfile.byos?.provider || 'unknown',
      uploaded_at: new Date().toISOString(),
      uploaded_by: user.id,
      definition_id: definitionId,
      definition_name: definitionName,
      size: fileData.length,
      type: mimeType,
      hash: fileHash,
    };

    console.log('🔵 [INSTRUCTOR-FILES] File metadata created:', fileMetadata);

    // Update instructor record with new file
    const currentFiles = Array.isArray(instructor.files) ? instructor.files : [];
    const updatedFiles = [...currentFiles, fileMetadata];

    console.log('🔵 [INSTRUCTOR-FILES] Updating instructor record. Old file count:', currentFiles.length, 'New count:', updatedFiles.length);

    const { error: updateError } = await tenantClient
      .from('Instructors')
      .update({ files: updatedFiles })
      .eq('id', instructorId);

    if (updateError) {
      console.error('❌ [INSTRUCTOR-FILES] Failed to update instructor files:', updateError.message, updateError);
      // Try to delete uploaded file from storage
      try {
        console.log('🔵 [INSTRUCTOR-FILES] Attempting cleanup of uploaded file...');
        await driver.delete(storagePath);
        console.log('✅ [INSTRUCTOR-FILES] Cleanup successful');
      } catch (cleanupError) {
        console.error('❌ [INSTRUCTOR-FILES] Failed to cleanup uploaded file:', cleanupError.message);
      }
      return respond(context, 500, { error: 'database_update_failed', details: updateError.message });
    }

    console.log('✅ [INSTRUCTOR-FILES] Upload complete! File ID:', fileId);
    console.log('\n\n✅✅✅ [INSTRUCTOR-FILES] ===== UPLOAD SUCCESS ===== ✅✅✅\n');
    context.log?.info?.('✅✅✅ INSTRUCTOR FILE UPLOAD SUCCESS ✅✅✅');

    return respond(context, 200, {
      success: true,
      file: fileMetadata,
    });

  } catch (error) {
    console.error('❌ [INSTRUCTOR-FILES] Unexpected error:', error.message, error.stack);
    context.log?.error?.('❌ INSTRUCTOR FILE UPLOAD ERROR:', error.message);
    return respond(context, 500, { error: 'internal_error', details: error.message });
  }
}

/**
 * DELETE /api/instructor-files - Delete file
 */
async function handleDelete(context, req) {
  let tenantClient = null;

  try {
    console.log('\n\n🗑️🗑️🗑️ [INSTRUCTOR-FILES] ===== DELETE STARTED ===== 🗑️🗑️🗑️\n');
    context.log?.info?.('🗑️🗑️🗑️ INSTRUCTOR FILE DELETE STARTED 🗑️🗑️🗑️');
    
    // Parse auth and resolve org
    const bearer = resolveBearerAuthorization(req);
    if (!bearer) {
      return respond(context, 401, { error: 'missing_authorization' });
    }

    const env = readEnv(context);
    const adminConfig = readSupabaseAdminConfig(env);
    const controlClient = createSupabaseAdminClient(adminConfig);

    // Verify session
    const { data: { user }, error: authError } = await controlClient.auth.getUser(bearer);
    if (authError || !user) {
      return respond(context, 401, { error: 'invalid_token' });
    }

    const orgId = resolveOrgId(req);
    if (!orgId) {
      return respond(context, 400, { error: 'missing_org_id' });
    }

    // Ensure user is a member
    const role = await ensureMembership(controlClient, orgId, user.id);
    if (!role) {
      return respond(context, 403, { error: 'not_org_member' });
    }

    const isAdmin = isAdminRole(role);

    // Parse request body
    const body = parseRequestBody(req);
    const { instructor_id, file_id } = body;

    if (!instructor_id || !file_id) {
      return respond(context, 400, { error: 'missing_required_fields', details: 'instructor_id and file_id are required' });
    }

    // Permission check: Non-admin users can only delete their own files
    if (!isAdmin && instructor_id !== user.id) {
      return respond(context, 403, { error: 'forbidden', message: 'You can only delete your own files' });
    }

    // CRITICAL: File deletion is restricted to admins only for data integrity
    // Even if user is deleting their own file, only admins can perform deletions
    if (!isAdmin) {
      return respond(context, 403, { error: 'forbidden', message: 'File deletion is restricted to administrators only' });
    }

    // Get storage profile
    const { data: orgSettings, error: settingsError } = await controlClient
      .from('org_settings')
      .select('storage_profile')
      .eq('org_id', orgId)
      .single();

    if (settingsError || !orgSettings?.storage_profile) {
      return respond(context, 424, { error: 'storage_not_configured' });
    }

    const storageProfile = orgSettings.storage_profile;

    // Decrypt BYOS credentials if needed
    let resolvedProfile = storageProfile;
    if (storageProfile.mode === 'byos' && storageProfile.byos) {
      const decrypted = decryptStorageProfile(storageProfile);
      resolvedProfile = { ...storageProfile, byos: decrypted.byos };
    }

    // Get environment variables for managed storage
    const r2Env = {
      SYSTEM_R2_ENDPOINT: process.env.SYSTEM_R2_ENDPOINT,
      SYSTEM_R2_ACCESS_KEY: process.env.SYSTEM_R2_ACCESS_KEY,
      SYSTEM_R2_SECRET_KEY: process.env.SYSTEM_R2_SECRET_KEY,
      SYSTEM_R2_BUCKET_NAME: process.env.SYSTEM_R2_BUCKET_NAME,
    };

    // Get tenant client
    tenantClient = await resolveTenantClient(controlClient, orgId);

    // Get instructor record
    const { data: instructor, error: instructorError } = await tenantClient
      .from('Instructors')
      .select('id, files')
      .eq('id', instructor_id)
      .single();

    if (instructorError || !instructor) {
      return respond(context, 404, { error: 'instructor_not_found' });
    }

    const currentFiles = Array.isArray(instructor.files) ? instructor.files : [];
    const fileToDelete = currentFiles.find(f => f.id === file_id);

    if (!fileToDelete) {
      return respond(context, 404, { error: 'file_not_found' });
    }

    // Delete from storage
    let driver;
    if (resolvedProfile.mode === 'managed') {
      driver = getStorageDriver('managed', null, r2Env);
    } else if (resolvedProfile.mode === 'byos') {
      driver = getStorageDriver('byos', resolvedProfile.byos, r2Env);
    } else {
      return respond(context, 500, { error: 'invalid_storage_mode' });
    }

    try {
      await driver.delete(fileToDelete.path);
    } catch (storageError) {
      context.log?.error?.('Failed to delete file from storage:', storageError);
      // Continue with database update even if storage delete fails
    }

    // Update instructor record
    const updatedFiles = currentFiles.filter(f => f.id !== file_id);

    const { error: updateError } = await tenantClient
      .from('Instructors')
      .update({ files: updatedFiles })
      .eq('id', instructor_id);

    if (updateError) {
      context.log?.error?.('Failed to update instructor files:', updateError);
      return respond(context, 500, { error: 'database_update_failed' });
    }

    return respond(context, 200, {
      success: true,
      deleted_file_id: file_id,
    });

  } catch (error) {
    context.log?.error?.('Instructor file delete error:', error);
    return respond(context, 500, { error: 'internal_error', details: error.message });
  }
}
