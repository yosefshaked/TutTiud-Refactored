/* eslint-env node */
/**
 * Organization Documents API
 * 
 * Handles file upload, update, and deletion for organizational documents.
 * Documents are not tied to specific students or instructors.
 * 
 * Storage paths:
 * - Managed: managed/{org_id}/general-docs/{file_id}.{ext}
 * - BYOS: general-docs/{org_id}/{file_id}.{ext}
 * 
 * Metadata stored in tuttiud.Settings with key 'org_documents' as JSONB array:
 * [{
 *   id: string (UUID),
 *   name: string (editable display name),
 *   original_name: string (original filename),
 *   relevant_date: string (ISO date, optional),
 *   expiration_date: string (ISO date, optional),
 *   url: string (storage URL),
 *   path: string (storage path),
 *   storage_provider: string,
 *   uploaded_at: string (ISO timestamp),
 *   uploaded_by: string (user ID),
 *   size: number (bytes),
 *   type: string (MIME type),
 *   hash: string (MD5 for deduplication)
 * }]
 * 
 * POST /api/org-documents - Upload file(s) with metadata
 * PUT /api/org-documents/:id - Update file metadata
 * DELETE /api/org-documents - Delete file
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
import { decryptStorageProfile } from '../_shared/storage-encryption.js';
import { logAuditEvent, AUDIT_ACTIONS, AUDIT_CATEGORIES } from '../_shared/audit-log.js';
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
 * Calculate MD5 hash of file content
 */
function calculateFileHash(buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

/**
 * Validate file upload
 */
function validateFileUpload(fileData, mimeType) {
  if (fileData.length > MAX_FILE_SIZE) {
    return { valid: false, error: 'file_too_large', details: `Maximum file size is ${MAX_FILE_SIZE / 1024 / 1024}MB` };
  }

  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return { valid: false, error: 'invalid_file_type', details: 'File type not allowed. Allowed types: PDF, images, Word, Excel' };
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
    throw new Error('Unsupported request body type');
  }

  return multipart.parse(bodyBuffer, boundary);
}

/**
 * Decode Hebrew filenames (handle UTF-8 mis-encoded as latin1)
 */
function decodeFilename(filename) {
  if (!filename) return filename;
  
  try {
    if (/[\u0080-\u00FF]/.test(filename)) {
      const originalBytes = Buffer.from(filename, 'latin1');
      const utf8Decoded = originalBytes.toString('utf8');
      
      if (!utf8Decoded.includes('\uFFFD')) {
        return utf8Decoded;
      }
    }
  } catch {
    // Keep original if decoding fails
  }
  
  return filename;
}

/**
 * Main handler
 */
export default async function handler(context, req) {
  console.info('[ORG-DOCS] Handler invoked', { 
    method: req.method,
    url: req.url,
    hasBody: !!req.body,
    contentType: req.headers?.['content-type']
  });
  
  const method = req.method;
  const env = readEnv(context);

  try {
    // Handle different HTTP methods
    if (method === 'POST') {
      console.info('[ORG-DOCS] Routing to handleUpload');
      const result = await handleUpload(req, context, env);
      console.info('[ORG-DOCS] handleUpload returned', { 
        status: result?.status,
        hasBody: !!result?.body
      });
      return result;
    } else if (method === 'PUT') {
      return await handleUpdate(req, context, env);
    } else if (method === 'DELETE') {
      return await handleDelete(req, context, env);
    } else if (method === 'GET') {
      return await handleList(req, context, env);
    }

    return respond(context, 405, { message: 'method_not_allowed' });
  } catch (error) {
    console.error('[ORG-DOCS] Handler crashed', {
      message: error.message,
      stack: error.stack
    });
    return respond(context, 500, { 
      message: 'handler_error',
      details: error.message
    });
  }
}

/**
 * Handle file upload (POST)
 */
async function handleUpload(req, context, env) {
  let userId, orgId, role;

  console.info('[ORG-DOCS] Upload handler started');

  try {
    // Parse authorization
    const authorization = resolveBearerAuthorization(req);
    console.info('[ORG-DOCS] Authorization parsed', { hasToken: !!authorization?.token });
    if (!authorization?.token) {
      console.warn('[ORG-DOCS] Missing bearer token');
      return respond(context, 401, { message: 'missing_bearer' });
    }

    // Parse org ID
    orgId = resolveOrgId(req);
    console.info('[ORG-DOCS] Org ID resolved', { orgId });
    if (!orgId) {
      return respond(context, 400, { message: 'missing_org_id' });
    }

    // Create control DB client
    const supabaseAdminConfig = readSupabaseAdminConfig(env);
    const controlClient = createSupabaseAdminClient(supabaseAdminConfig, context);
    console.info('[ORG-DOCS] Control DB client created');

    // Validate token
    let authResult;
    try {
      authResult = await controlClient.auth.getUser(authorization.token);
    } catch (error) {
      console.error('[ORG-DOCS] Failed to validate token', { message: error?.message });
      return respond(context, 401, { message: 'invalid_or_expired_token' });
    }

    if (authResult.error || !authResult.data?.user?.id) {
      console.warn('[ORG-DOCS] Token validation failed', {
        hasError: !!authResult.error,
        errorMessage: authResult.error?.message,
        hasUser: !!authResult.data?.user,
      });
      return respond(context, 401, { message: 'invalid_or_expired_token' });
    }

    userId = authResult.data.user.id;
    console.info('[ORG-DOCS] User authenticated', { userId });

    // Verify membership and require admin/owner
    try {
      role = await ensureMembership(controlClient, orgId, userId);
      console.info('[ORG-DOCS] Membership verified', { role });
    } catch (membershipError) {
      console.error('[ORG-DOCS] Membership verification failed', {
        message: membershipError?.message,
        orgId,
        userId,
      });
      return respond(context, 500, { message: 'failed_to_verify_membership' });
    }

    if (!role) {
      console.warn('[ORG-DOCS] User is not a member');
      return respond(context, 403, { message: 'not_a_member' });
    }

    // Only admin/owner can upload org documents
    if (role !== 'admin' && role !== 'owner') {
      console.warn('[ORG-DOCS] Insufficient permissions', { role });
      return respond(context, 403, { message: 'insufficient_permissions', details: 'Only admins and owners can manage organizational documents' });
    }

    // Parse multipart form data
    let parts;
    try {
      console.info('[ORG-DOCS] Starting multipart parse');
      parts = parseMultipartData(req);
      console.info('[ORG-DOCS] Multipart parsed', { partsCount: parts.length });
    } catch (parseError) {
      console.error('[ORG-DOCS] Failed to parse multipart data', { message: parseError.message, stack: parseError.stack });
      return respond(context, 400, { message: 'invalid_multipart_data', details: parseError.message });
    }

    // Extract file and metadata from form parts
    const filePart = parts.find(p => p.name === 'file');
    const namePart = parts.find(p => p.name === 'name');
    const relevantDatePart = parts.find(p => p.name === 'relevant_date');
    const expirationDatePart = parts.find(p => p.name === 'expiration_date');

    console.info('[ORG-DOCS] Form parts extracted', {
      hasFile: !!filePart,
      hasName: !!namePart,
      hasRelevantDate: !!relevantDatePart,
      hasExpirationDate: !!expirationDatePart,
    });

    if (!filePart || !filePart.data) {
      console.error('[ORG-DOCS] No file in upload');
      return respond(context, 400, { message: 'no_file_uploaded' });
    }

    // Decode filename
    let decodedFilename = decodeFilename(filePart.filename);
    
    // Extract custom name if provided, otherwise use decoded filename
    const customName = namePart ? namePart.data.toString('utf8').trim() : decodedFilename;
    const relevantDate = relevantDatePart ? relevantDatePart.data.toString('utf8').trim() : null;
    const expirationDate = expirationDatePart ? expirationDatePart.data.toString('utf8').trim() : null;

    console.info('[ORG-DOCS] File metadata extracted', {
      filename: decodedFilename,
      customName,
      mimeType: filePart.type,
      fileSize: filePart.data.length,
      orgId,
      relevantDate,
      expirationDate,
    });

    // Validate file
    console.info('[ORG-DOCS] Validating file');
    const validation = validateFileUpload(filePart.data, filePart.type);
    if (!validation.valid) {
      console.warn('[ORG-DOCS] File validation failed', { error: validation.error, details: validation.details });
      return respond(context, 400, { 
        message: validation.error,
        details: validation.details 
      });
    }
    console.info('[ORG-DOCS] File validation passed');

    // Get storage profile
    console.info('[ORG-DOCS] Loading storage profile');
    const { data: orgSettings, error: settingsError } = await controlClient
      .from('org_settings')
      .select('storage_profile')
      .eq('org_id', orgId)
      .maybeSingle();

    if (settingsError) {
      console.error('[ORG-DOCS] Failed to load storage profile', { message: settingsError.message });
      return respond(context, 500, { message: 'failed_to_load_storage_profile' });
    }

    console.info('[ORG-DOCS] Storage profile loaded', { 
      hasProfile: !!orgSettings?.storage_profile,
      mode: orgSettings?.storage_profile?.mode,
    });

    const storageProfile = orgSettings?.storage_profile;
    if (!storageProfile || !storageProfile.mode) {
      console.error('[ORG-DOCS] Storage not configured');
      return respond(context, 400, { message: 'storage_not_configured' });
    }

    // Decrypt BYOS credentials if present
    console.info('[ORG-DOCS] Decrypting storage profile');
    const decryptedProfile = decryptStorageProfile(storageProfile, env);
    console.info('[ORG-DOCS] Storage profile decrypted', {
      mode: decryptedProfile.mode,
      disconnected: decryptedProfile.disconnected,
    });

    // Block uploads if storage is disconnected
    if (decryptedProfile.disconnected === true) {
      console.warn('[ORG-DOCS] Storage is disconnected');
      return respond(context, 403, { 
        message: 'storage_disconnected',
        details: 'Storage is disconnected. Please reconnect or reconfigure storage to upload files.'
      });
    }

    // Calculate file hash
    console.info('[ORG-DOCS] Calculating file hash');
    const fileHash = calculateFileHash(filePart.data);
    console.info('[ORG-DOCS] File hash calculated', { hash: fileHash });

    // Generate file metadata
    const fileId = generateFileId();
    const filenameParts = decodedFilename.split('.');
    const extension = filenameParts.length > 1 ? filenameParts.pop() : '';
    const storageFilename = extension ? `${fileId}.${extension}` : fileId;

    // Construct storage path based on mode
    let storagePath;
    if (decryptedProfile.mode === 'managed') {
      storagePath = `managed/${orgId}/general-docs/${storageFilename}`;
    } else {
      storagePath = `general-docs/${orgId}/${storageFilename}`;
    }

    console.info('[ORG-DOCS] Storage path constructed', {
      fileId,
      storagePath,
      mode: decryptedProfile.mode,
    });

    // Upload to storage
    console.info('[ORG-DOCS] Getting storage driver');
    let driver;
    try {
      if (decryptedProfile.mode === 'managed') {
        // Check for required R2 environment variables
        const hasR2Config = env.SYSTEM_R2_ENDPOINT && env.SYSTEM_R2_ACCESS_KEY && 
                           env.SYSTEM_R2_SECRET_KEY && env.SYSTEM_R2_BUCKET_NAME;
        if (!hasR2Config) {
          console.error('[ORG-DOCS] Managed storage R2 environment variables not configured');
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
      console.error('[ORG-DOCS] Failed to create storage driver', { 
        message: driverError?.message,
        stack: driverError?.stack,
        mode: decryptedProfile.mode
      });
      return respond(context, 500, { 
        message: 'storage_driver_error', 
        details: driverError.message 
      });
    }
    console.info('[ORG-DOCS] Storage driver obtained, starting upload');
    
    let uploadResult;
    try {
      uploadResult = await driver.upload(storagePath, filePart.data, filePart.type);
      console.info('[ORG-DOCS] Storage upload successful', { 
        url: uploadResult.url,
        path: storagePath,
      });
    } catch (uploadError) {
      console.error('[ORG-DOCS] Storage upload failed', { 
        message: uploadError.message,
        stack: uploadError.stack,
        path: storagePath,
      });
      return respond(context, 500, { 
        message: 'storage_upload_failed',
        details: uploadError.message 
      });
    }

    // Create file record
    const fileRecord = {
      id: fileId,
      name: customName,
      original_name: decodedFilename,
      relevant_date: relevantDate || null,
      expiration_date: expirationDate || null,
      url: uploadResult.url,
      path: storagePath,
      storage_provider: decryptedProfile.mode === 'managed' ? 'cloudflare_r2' : decryptedProfile.provider,
      uploaded_at: new Date().toISOString(),
      uploaded_by: userId,
      size: filePart.data.length,
      type: filePart.type,
      hash: fileHash,
    };

    // Get tenant client
    console.info('[ORG-DOCS] Resolving tenant client');
    const { client: tenantClient, error: tenantError } = await resolveTenantClient(context, controlClient, env, orgId);
    if (tenantError) {
      console.error('[ORG-DOCS] Failed to resolve tenant client', tenantError);
      return respond(context, tenantError.status, tenantError.body);
    }
    console.info('[ORG-DOCS] Tenant client resolved');

    // Load existing org documents from Settings
    console.info('[ORG-DOCS] Loading existing documents from Settings');
    const { data: existingSettings, error: loadError } = await tenantClient
      .from('Settings')
      .select('settings_value')
      .eq('key', 'org_documents')
      .maybeSingle();

    if (loadError && loadError.code !== 'PGRST116') {
      console.error('[ORG-DOCS] Failed to load org documents', { message: loadError.message });
      return respond(context, 500, { message: 'failed_to_load_documents' });
    }

    const existingDocs = existingSettings?.settings_value || [];
    console.info('[ORG-DOCS] Existing documents loaded', { count: existingDocs.length });
    
    const updatedDocs = [...existingDocs, fileRecord];
    console.info('[ORG-DOCS] Preparing to save updated documents', { newCount: updatedDocs.length });

    // Save updated documents list
    const { error: upsertError } = await tenantClient
      .from('Settings')
      .upsert({
        key: 'org_documents',
        settings_value: updatedDocs,
      });

    if (upsertError) {
      console.error('[ORG-DOCS] Failed to save org documents', { message: upsertError.message, code: upsertError.code });
      return respond(context, 500, { message: 'failed_to_save_documents' });
    }
    console.info('[ORG-DOCS] Documents saved successfully');

    // Log audit event
    console.info('[ORG-DOCS] Logging audit event');
    await logAuditEvent(controlClient, {
      orgId,
      userId,
      userEmail: authResult.data.user.email,
      userRole: role,
      actionType: AUDIT_ACTIONS.FILE_UPLOADED,
      actionCategory: AUDIT_CATEGORIES.FILES,
      resourceType: 'org_document',
      resourceId: fileId,
      details: {
        file_name: customName,
        original_name: decodedFilename,
        file_size: filePart.data.length,
        storage_mode: decryptedProfile.mode,
        relevant_date: relevantDate,
        expiration_date: expirationDate,
      },
    });

    console.info('[ORG-DOCS] ✅ Upload completed successfully', {
      fileId,
      orgId,
      filename: customName,
      url: uploadResult.url,
    });

    const responseBody = { 
      message: 'upload_success',
      file: fileRecord,
    };
    
    console.info('[ORG-DOCS] Returning response', { 
      status: 200,
      hasFile: !!fileRecord,
      fileId: fileRecord?.id,
      responseBodyKeys: Object.keys(responseBody)
    });

    return respond(context, 200, responseBody);

  } catch (error) {
    console.error('[ORG-DOCS] ❌ Upload error - UNCAUGHT EXCEPTION', {
      message: error.message,
      stack: error.stack,
      orgId,
      userId,
    });
    return respond(context, 500, { 
      message: 'internal_server_error',
      details: error.message 
    });
  }
}

/**
 * Handle metadata update (PUT)
 */
async function handleUpdate(req, context, env) {
  let userId, orgId, role;

  try {
    // Parse authorization
    const authorization = resolveBearerAuthorization(req);
    if (!authorization?.token) {
      return respond(context, 401, { message: 'missing_bearer' });
    }

    // Parse org ID
    orgId = resolveOrgId(req);
    if (!orgId) {
      return respond(context, 400, { message: 'missing_org_id' });
    }

    // Parse request body
    const body = parseRequestBody(req);
    const { file_id, name, relevant_date, expiration_date } = body;

    if (!file_id) {
      return respond(context, 400, { message: 'missing_file_id' });
    }

    // Create control DB client
    const supabaseAdminConfig = readSupabaseAdminConfig(env);
    const controlClient = createSupabaseAdminClient(supabaseAdminConfig, context);

    // Validate token
    let authResult;
    try {
      authResult = await controlClient.auth.getUser(authorization.token);
    } catch (error) {
      return respond(context, 401, { message: 'invalid_or_expired_token' });
    }

    if (authResult.error || !authResult.data?.user?.id) {
      return respond(context, 401, { message: 'invalid_or_expired_token' });
    }

    userId = authResult.data.user.id;

    // Verify membership and require admin/owner
    try {
      role = await ensureMembership(controlClient, orgId, userId);
    } catch (membershipError) {
      console.error('org-documents update failed to verify membership', {
        message: membershipError?.message,
        orgId,
        userId,
      });
      return respond(context, 500, { message: 'failed_to_verify_membership' });
    }

    if (!role) {
      return respond(context, 403, { message: 'not_a_member' });
    }

    if (role !== 'admin' && role !== 'owner') {
      return respond(context, 403, { message: 'insufficient_permissions' });
    }

    // Get tenant client
    const { client: tenantClient, error: tenantError } = await resolveTenantClient(context, controlClient, env, orgId);
    if (tenantError) {
      return respond(context, tenantError.status, tenantError.body);
    }

    // Load existing documents
    const { data: existingSettings, error: loadError } = await tenantClient
      .from('Settings')
      .select('settings_value')
      .eq('key', 'org_documents')
      .maybeSingle();

    if (loadError && loadError.code !== 'PGRST116') {
      console.error('Failed to load org documents', { message: loadError.message });
      return respond(context, 500, { message: 'failed_to_load_documents' });
    }

    const existingDocs = existingSettings?.settings_value || [];
    const fileIndex = existingDocs.findIndex(f => f.id === file_id);

    if (fileIndex === -1) {
      return respond(context, 404, { message: 'file_not_found' });
    }

    // Update file metadata
    const updatedFile = {
      ...existingDocs[fileIndex],
      name: name !== undefined ? name : existingDocs[fileIndex].name,
      relevant_date: relevant_date !== undefined ? relevant_date : existingDocs[fileIndex].relevant_date,
      expiration_date: expiration_date !== undefined ? expiration_date : existingDocs[fileIndex].expiration_date,
    };

    const updatedDocs = [...existingDocs];
    updatedDocs[fileIndex] = updatedFile;

    // Save updated documents
    const { error: upsertError } = await tenantClient
      .from('Settings')
      .upsert({
        key: 'org_documents',
        settings_value: updatedDocs,
      });

    if (upsertError) {
      console.error('Failed to save updated org documents', { message: upsertError.message });
      return respond(context, 500, { message: 'failed_to_save_documents' });
    }

    // Log audit event
    await logAuditEvent(controlClient, {
      orgId,
      userId,
      userEmail: authResult.data.user.email,
      userRole: role,
      actionType: 'org_document_updated',
      actionCategory: AUDIT_CATEGORIES.FILES,
      resourceType: 'org_document',
      resourceId: file_id,
      details: {
        updated_fields: Object.keys(body).filter(k => k !== 'file_id' && k !== 'org_id'),
        file_name: updatedFile.name,
      },
    });

    return respond(context, 200, { 
      message: 'update_success',
      file: updatedFile,
    });

  } catch (error) {
    console.error('Org document update error', {
      message: error.message,
      stack: error.stack,
    });
    return respond(context, 500, { 
      message: 'internal_server_error',
      details: error.message 
    });
  }
}

/**
 * Handle file deletion (DELETE)
 */
async function handleDelete(req, context, env) {
  let userId, orgId, role;

  try {
    // Parse authorization
    const authorization = resolveBearerAuthorization(req);
    if (!authorization?.token) {
      return respond(context, 401, { message: 'missing_bearer' });
    }

    // Parse org ID and file ID
    orgId = resolveOrgId(req);
    if (!orgId) {
      return respond(context, 400, { message: 'missing_org_id' });
    }

    const body = parseRequestBody(req);
    const { file_id } = body;

    if (!file_id) {
      return respond(context, 400, { message: 'missing_file_id' });
    }

    // Create control DB client
    const supabaseAdminConfig = readSupabaseAdminConfig(env);
    const controlClient = createSupabaseAdminClient(supabaseAdminConfig, context);

    // Validate token
    let authResult;
    try {
      authResult = await controlClient.auth.getUser(authorization.token);
    } catch (error) {
      return respond(context, 401, { message: 'invalid_or_expired_token' });
    }

    if (authResult.error || !authResult.data?.user?.id) {
      return respond(context, 401, { message: 'invalid_or_expired_token' });
    }

    userId = authResult.data.user.id;

    // Verify membership and require admin/owner
    try {
      role = await ensureMembership(controlClient, orgId, userId);
    } catch (membershipError) {
      console.error('org-documents delete failed to verify membership', {
        message: membershipError?.message,
        orgId,
        userId,
      });
      return respond(context, 500, { message: 'failed_to_verify_membership' });
    }

    if (!role) {
      return respond(context, 403, { message: 'not_a_member' });
    }

    if (role !== 'admin' && role !== 'owner') {
      return respond(context, 403, { message: 'insufficient_permissions' });
    }

    // Get tenant client
    const { client: tenantClient, error: tenantError } = await resolveTenantClient(context, controlClient, env, orgId);
    if (tenantError) {
      return respond(context, tenantError.status, tenantError.body);
    }

    // Load existing documents
    const { data: existingSettings, error: loadError } = await tenantClient
      .from('Settings')
      .select('settings_value')
      .eq('key', 'org_documents')
      .maybeSingle();

    if (loadError && loadError.code !== 'PGRST116') {
      console.error('Failed to load org documents', { message: loadError.message });
      return respond(context, 500, { message: 'failed_to_load_documents' });
    }

    const existingDocs = existingSettings?.settings_value || [];
    const fileToDelete = existingDocs.find(f => f.id === file_id);

    if (!fileToDelete) {
      return respond(context, 404, { message: 'file_not_found' });
    }

    // Get storage profile
    const { data: orgSettings, error: settingsError } = await controlClient
      .from('org_settings')
      .select('storage_profile')
      .eq('org_id', orgId)
      .maybeSingle();

    if (settingsError) {
      console.error('Failed to load storage profile', { message: settingsError.message });
      return respond(context, 500, { message: 'failed_to_load_storage_profile' });
    }

    const storageProfile = orgSettings?.storage_profile;
    if (storageProfile && storageProfile.mode) {
      // Decrypt BYOS credentials if present
      const decryptedProfile = decryptStorageProfile(storageProfile, env);

      // Delete from storage (best effort - don't fail if already deleted)
      let driver;
      try {
        if (decryptedProfile.mode === 'managed') {
          driver = getStorageDriver('managed', null, env);
        } else if (decryptedProfile.mode === 'byos') {
          if (!decryptedProfile.byos) {
            console.warn('BYOS config missing, skipping physical deletion');
          } else {
            driver = getStorageDriver('byos', decryptedProfile.byos, env);
          }
        }
      } catch (driverError) {
        console.warn('Failed to create storage driver for deletion', { message: driverError?.message });
        // Continue to remove from database even if driver creation fails
      }

      // Delete physical file
      if (driver && fileToDelete.path) {
        try {
          await driver.delete(fileToDelete.path);
          console.info('Physical file deleted', { path: fileToDelete.path });
        } catch (deleteError) {
          console.warn('Failed to delete physical file', { message: deleteError?.message });
          // Continue to remove from database even if physical deletion fails
        }
      }
    }

    // Remove from documents list
    const updatedDocs = existingDocs.filter(f => f.id !== file_id);

    // Save updated list
    const { error: upsertError } = await tenantClient
      .from('Settings')
      .upsert({
        key: 'org_documents',
        settings_value: updatedDocs,
      });

    if (upsertError) {
      console.error('Failed to save updated org documents', { message: upsertError.message });
      return respond(context, 500, { message: 'failed_to_save_documents' });
    }

    // Log audit event
    await logAuditEvent(controlClient, {
      orgId,
      userId,
      userEmail: authResult.data.user.email,
      userRole: role,
      actionType: AUDIT_ACTIONS.FILE_DELETED,
      actionCategory: AUDIT_CATEGORIES.FILES,
      resourceType: 'org_document',
      resourceId: file_id,
      details: {
        file_name: fileToDelete.name,
      },
    });

    return respond(context, 200, { message: 'delete_success' });

  } catch (error) {
    console.error('Org document delete error', {
      message: error.message,
      stack: error.stack,
    });
    return respond(context, 500, { 
      message: 'internal_server_error',
      details: error.message 
    });
  }
}

/**
 * Handle list documents (GET)
 */
async function handleList(req, context, env) {
  let userId, orgId;

  try {
    // Parse authorization
    const authorization = resolveBearerAuthorization(req);
    if (!authorization?.token) {
      return respond(context, 401, { message: 'missing_bearer' });
    }

    // Parse org ID
    orgId = resolveOrgId(req);
    if (!orgId) {
      return respond(context, 400, { message: 'missing_org_id' });
    }

    // Create control DB client
    const supabaseAdminConfig = readSupabaseAdminConfig(env);
    const controlClient = createSupabaseAdminClient(supabaseAdminConfig, context);

    // Validate token
    let authResult;
    try {
      authResult = await controlClient.auth.getUser(authorization.token);
    } catch (error) {
      return respond(context, 401, { message: 'invalid_or_expired_token' });
    }

    if (authResult.error || !authResult.data?.user?.id) {
      return respond(context, 401, { message: 'invalid_or_expired_token' });
    }

    userId = authResult.data.user.id;

    // Verify membership
    let role;
    try {
      role = await ensureMembership(controlClient, orgId, userId);
    } catch (membershipError) {
      console.error('org-documents list failed to verify membership', {
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

    // Check if non-admin members can view org documents
    const isAdmin = role === 'admin' || role === 'owner';
    if (!isAdmin) {
      // Load visibility setting
      const { data: visibilitySetting, error: visibilityError } = await tenantClient
        .from('Settings')
        .select('settings_value')
        .eq('key', 'org_documents_member_visibility')
        .maybeSingle();

      if (visibilityError && visibilityError.code !== 'PGRST116') {
        console.error('Failed to load visibility setting', { message: visibilityError.message });
        return respond(context, 500, { message: 'failed_to_load_settings' });
      }

      const allowMemberView = visibilitySetting?.settings_value ?? false;
      if (!allowMemberView) {
        return respond(context, 403, { message: 'members_cannot_view_org_documents' });
      }
    }

    // Load documents
    const { data: existingSettings, error: loadError } = await tenantClient
      .from('Settings')
      .select('settings_value')
      .eq('key', 'org_documents')
      .maybeSingle();

    if (loadError && loadError.code !== 'PGRST116') {
      console.error('Failed to load org documents', { message: loadError.message });
      return respond(context, 500, { message: 'failed_to_load_documents' });
    }

    const documents = existingSettings?.settings_value || [];

    return respond(context, 200, { 
      documents,
    });

  } catch (error) {
    console.error('Org documents list error', {
      message: error.message,
      stack: error.stack,
    });
    return respond(context, 500, { 
      message: 'internal_server_error',
      details: error.message 
    });
  }
}

