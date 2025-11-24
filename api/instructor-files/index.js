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
export default async function handler(req, context) {
  const { method } = req;

  if (method === 'POST') {
    return await handleUpload(req, context);
  } else if (method === 'DELETE') {
    return await handleDelete(req, context);
  } else {
    return respond(context, 405, { error: 'method_not_allowed' });
  }
}

/**
 * POST /api/instructor-files - Upload file
 */
async function handleUpload(req, context) {
  let tenantClient = null;

  try {
    // Parse auth and resolve org
    const bearer = resolveBearerAuthorization(req);
    if (!bearer) {
      return respond(context, 401, { error: 'missing_authorization' });
    }

    const controlDbUrl = readEnv('APP_CONTROL_DB_URL');
    const controlDbServiceRoleKey = readEnv('APP_CONTROL_DB_SERVICE_ROLE_KEY');
    const { client: controlClient } = await createSupabaseAdminClient(
      readSupabaseAdminConfig(controlDbUrl, controlDbServiceRoleKey)
    );

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

    // Check if storage is disconnected
    if (storageProfile.disconnected === true) {
      return respond(context, 403, { error: 'storage_disconnected', message: 'Storage is disconnected. Please reconnect storage to upload files.' });
    }

    // Decrypt BYOS credentials if needed
    let resolvedProfile = storageProfile;
    if (storageProfile.mode === 'byos' && storageProfile.byos) {
      const decrypted = decryptStorageProfile(storageProfile);
      resolvedProfile = { ...storageProfile, byos: decrypted.byos };
    }

    // Parse multipart data
    const parts = parseMultipartData(req);

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

    // Permission check: Non-admin users can only upload to their own instructor record
    if (!isAdmin && instructorId !== user.id) {
      return respond(context, 403, { error: 'forbidden', message: 'You can only upload files to your own instructor record' });
    }

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
    const driver = getStorageDriver(resolvedProfile);

    // Upload to storage
    await driver.putFile(storagePath, fileData, mimeType);

    // Get presigned URL for immediate access
    const url = await driver.getPresignedUrl(storagePath, 3600); // 1 hour expiry

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

    // Update instructor record with new file
    const currentFiles = Array.isArray(instructor.files) ? instructor.files : [];
    const updatedFiles = [...currentFiles, fileMetadata];

    const { error: updateError } = await tenantClient
      .from('Instructors')
      .update({ files: updatedFiles })
      .eq('id', instructorId);

    if (updateError) {
      context.log.error('Failed to update instructor files:', updateError);
      // Try to delete uploaded file from storage
      try {
        await driver.deleteFile(storagePath);
      } catch (cleanupError) {
        context.log.error('Failed to cleanup uploaded file:', cleanupError);
      }
      return respond(context, 500, { error: 'database_update_failed' });
    }

    return respond({
      status: 200,
      body: {
        success: true,
        file: fileMetadata,
      },
    });

  } catch (error) {
    context.log.error('Instructor file upload error:', error);
    return respond({
      status: 500,
      body: { error: 'internal_error', details: error.message },
    });
  }
}

/**
 * DELETE /api/instructor-files - Delete file
 */
async function handleDelete(req, context) {
  let tenantClient = null;

  try {
    // Parse auth and resolve org
    const bearer = resolveBearerAuthorization(req);
    if (!bearer) {
      return respond(context, 401, { error: 'missing_authorization' });
    }

    const controlDbUrl = readEnv('APP_CONTROL_DB_URL');
    const controlDbServiceRoleKey = readEnv('APP_CONTROL_DB_SERVICE_ROLE_KEY');
    const { client: controlClient } = await createSupabaseAdminClient(
      readSupabaseAdminConfig(controlDbUrl, controlDbServiceRoleKey)
    );

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
    const driver = getStorageDriver(resolvedProfile);
    try {
      await driver.deleteFile(fileToDelete.path);
    } catch (storageError) {
      context.log.error('Failed to delete file from storage:', storageError);
      // Continue with database update even if storage delete fails
    }

    // Update instructor record
    const updatedFiles = currentFiles.filter(f => f.id !== file_id);

    const { error: updateError } = await tenantClient
      .from('Instructors')
      .update({ files: updatedFiles })
      .eq('id', instructor_id);

    if (updateError) {
      context.log.error('Failed to update instructor files:', updateError);
      return respond(context, 500, { error: 'database_update_failed' });
    }

    return respond({
      status: 200,
      body: {
        success: true,
        deleted_file_id: file_id,
      },
    });

  } catch (error) {
    context.log.error('Instructor file delete error:', error);
    return respond({
      status: 500,
      body: { error: 'internal_error', details: error.message },
    });
  }
}

