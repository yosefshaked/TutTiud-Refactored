/* eslint-env node */
/* global Buffer */
/**
 * Student Files API
 * 
 * Handles file upload and deletion for student documents.
 * Integrates with Phase 1 storage configuration (BYOS vs Managed).
 * 
 * Managed Storage: Uses Cloudflare R2 (configured via environment variables)
 * BYOS Storage: Supports AWS S3, Azure Blob, Cloudflare R2, and Supabase
 * 
 * POST /api/student-files - Upload file
 * DELETE /api/student-files - Delete file
 */

import { resolveBearerAuthorization } from '../_shared/http.js';
import { createSupabaseAdminClient, readSupabaseAdminConfig } from '../_shared/supabase-admin.js';
import {
  ensureMembership,
  parseRequestBody,
  readEnv,
  respond,
  resolveOrgId,
  resolveTenantClient,
} from '../_shared/org-bff.js';
import { getStorageDriver } from '../cross-platform/storage-drivers/index.js';
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

/**
 * Build file path based on storage mode
 */
function buildFilePath(mode, orgId, studentId, fileId, extension) {
  if (mode === 'managed') {
    // Managed storage: namespace isolation with 'managed/' prefix
    return `managed/${orgId}/${studentId}/${fileId}.${extension}`;
  } else {
    // BYOS: simpler path without 'managed/' prefix
    return `students/${studentId}/${fileId}.${extension}`;
  }
}

export default async function (context, req) {
  context.log?.info?.('student-files: request received', { method: req.method });

  const env = readEnv(context);
  const adminConfig = readSupabaseAdminConfig(env);
  if (!adminConfig.supabaseUrl || !adminConfig.serviceRoleKey) {
    context.log?.error?.('student-files missing Supabase admin credentials');
    return respond(context, 500, { message: 'server_misconfigured' });
  }

  const authorization = resolveBearerAuthorization(req);
  if (!authorization?.token) {
    context.log?.warn?.('student-files missing bearer token', {
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
    context.log?.error?.('student-files failed to validate token', { message: error?.message });
    return respond(context, 401, { message: 'invalid_or_expired_token' });
  }

  if (authResult.error || !authResult.data?.user?.id) {
    context.log?.warn?.('student-files token validation failed', {
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
    const studentIdPart = parts.find(p => p.name === 'student_id');
    const orgIdPart = parts.find(p => p.name === 'org_id');
    const defIdPart = parts.find(p => p.name === 'definition_id');
    const fileNamePart = parts.find(p => p.name === 'custom_name');

    if (!filePart) {
      return respond(context, 400, { message: 'no_file_provided' });
    }

    if (!studentIdPart || !orgIdPart) {
      return respond(context, 400, { message: 'missing_student_id_or_org_id' });
    }

    const studentId = studentIdPart.data.toString('utf8').trim();
    const orgId = orgIdPart.data.toString('utf8').trim();
    const definitionId = defIdPart ? defIdPart.data.toString('utf8').trim() : null;
    const customName = fileNamePart ? fileNamePart.data.toString('utf8').trim() : filePart.filename;

    context.log?.info?.('File upload parsed', {
      filename: filePart.filename,
      mimeType: filePart.type,
      fileSize: filePart.data.length,
      studentId,
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
      context.log?.error?.('student-files failed to verify membership', {
        message: membershipError?.message,
        orgId,
        userId,
      });
      return respond(context, 500, { message: 'failed_to_verify_membership' });
    }

    if (!role) {
      return respond(context, 403, { message: 'not_a_member' });
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

    // Calculate file hash for deduplication tracking
    const fileHash = calculateFileHash(filePart.data);

    // Generate file metadata
    const fileId = generateFileId();
    const filenameParts = filePart.filename.split('.');
    const extension = filenameParts.length > 1 && filenameParts[filenameParts.length - 1] 
      ? filenameParts[filenameParts.length - 1] 
      : 'bin';
    const filePath = buildFilePath(storageProfile.mode, orgId, studentId, fileId, extension);
    const contentType = filePart.type || 'application/octet-stream';

    // Get storage driver
    let driver;
    try {
      if (storageProfile.mode === 'managed') {
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
      } else if (storageProfile.mode === 'byos') {
        if (!storageProfile.byos) {
          return respond(context, 400, { message: 'byos_config_missing' });
        }
        driver = getStorageDriver('byos', storageProfile.byos, env);
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

    // Create file metadata
    const fileMetadata = {
      id: fileId,
      name: customName || filePart.filename,
      original_name: filePart.filename,
      url: uploadResult.url,
      path: filePath,
      storage_provider: storageProfile.mode,
      uploaded_at: new Date().toISOString(),
      uploaded_by: userId,
      definition_id: definitionId || null,
      size: filePart.data.length,
      type: contentType,
      hash: fileHash,
    };

    // Get tenant client for database update
    const { client: tenantClient, error: tenantError } = await resolveTenantClient(context, controlClient, env, orgId);
    if (tenantError) {
      return respond(context, tenantError.status, tenantError.body);
    }

    // Fetch current student (name + files) to build proper filename and append new file
    const { data: currentStudent, error: fetchError } = await tenantClient
      .from('Students')
      .select('name, files')
      .eq('id', studentId)
      .single();

    if (fetchError) {
      context.log?.error?.('Failed to fetch student for file upload', { 
        message: fetchError.message,
        code: fetchError.code,
        details: fetchError.details,
        hint: fetchError.hint,
        studentId,
        orgId,
      });
      return respond(context, 500, { 
        message: 'failed_to_fetch_student',
        error: fetchError.message,
        student_id: studentId,
      });
    }

    // Build proper display name based on definition and student
    let displayName = customName || filePart.filename;
    let definitionName = null;

    if (definitionId) {
      // Fetch document definitions from settings to get the definition name
      const { data: settingsData, error: settingsError } = await controlClient
        .from('Settings')
        .select('settings_value')
        .eq('org_id', orgId)
        .eq('settings_key', 'document_definitions')
        .maybeSingle();

      if (!settingsError && settingsData?.settings_value) {
        const definitions = Array.isArray(settingsData.settings_value) ? settingsData.settings_value : [];
        const definition = definitions.find(d => d.id === definitionId);
        if (definition?.name) {
          definitionName = definition.name;
          const studentName = currentStudent?.name || 'תלמיד';
          // Build filename: "Definition Name - Student Name"
          displayName = `${definitionName} - ${studentName}`;
        }
      }
    }

    // Build complete file metadata object with all properties
    const completeFileMetadata = {
      ...fileMetadata,
      name: displayName,
      ...(definitionName && { definition_name: definitionName }),
    };

    const currentFiles = Array.isArray(currentStudent?.files) ? currentStudent.files : [];
    
    const updatedFiles = [...currentFiles, completeFileMetadata];

    // Update student record
    const { error: updateError } = await tenantClient
      .from('Students')
      .update({ files: updatedFiles })
      .eq('id', studentId);

    if (updateError) {
      context.log?.error?.('Failed to update student files', { message: updateError.message });
      return respond(context, 500, { message: 'failed_to_update_student' });
    }

    context.log?.info?.('File uploaded successfully', { fileId, studentId, mode: storageProfile.mode });

    return respond(context, 200, {
      file: fileMetadata,
    });
  }

  // DELETE: Remove file
  if (req.method === 'DELETE') {
    const body = parseRequestBody(req);
    const orgId = resolveOrgId(req, body);
    const { student_id: studentId, file_id: fileId } = body;

    if (!orgId || !studentId || !fileId) {
      return respond(context, 400, { message: 'missing_required_fields' });
    }

    // Verify membership
    let role;
    try {
      role = await ensureMembership(controlClient, orgId, userId);
    } catch (membershipError) {
      context.log?.error?.('student-files failed to verify membership', {
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

    // Get tenant client
    const { client: tenantClient, error: tenantError } = await resolveTenantClient(context, controlClient, env, orgId);
    if (tenantError) {
      return respond(context, tenantError.status, tenantError.body);
    }
    
    // Fetch current files array
    const { data: student, error: fetchError } = await tenantClient
      .from('Students')
      .select('files')
      .eq('id', studentId)
      .single();

    if (fetchError) {
      context.log?.error?.('Failed to fetch student', { message: fetchError.message });
      return respond(context, 500, { message: 'failed_to_fetch_student' });
    }

    const currentFiles = Array.isArray(student?.files) ? student.files : [];
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

    // Update student record
    const { error: updateError } = await tenantClient
      .from('Students')
      .update({ files: updatedFiles })
      .eq('id', studentId);

    if (updateError) {
      context.log?.error?.('Failed to update student files', { message: updateError.message });
      return respond(context, 500, { message: 'failed_to_update_student' });
    }

    context.log?.info?.('File deleted successfully', { fileId, studentId });

    return respond(context, 200, { success: true });
  }

  return respond(context, 405, { message: 'method_not_allowed' });
}
