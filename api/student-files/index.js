/* eslint-env node */
/**
 * Student Files API
 * 
 * Handles file upload and deletion for student documents.
 * Integrates with Phase 1 storage configuration (BYOS vs Managed).
 * 
 * POST /api/student-files - Upload file
 * DELETE /api/student-files - Delete file
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
} from '../_shared/org-bff.js';
import { createTenantClient } from '../_shared/tenant-client.js';
import multipart from 'parse-multipart-data';

/**
 * Generate unique file ID
 */
function generateFileId() {
  return crypto.randomUUID();
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
  const bodyBuffer = req.rawBody || Buffer.from(req.body);
  const parts = multipart.parse(bodyBuffer, boundary);

  return parts;
}

/**
 * Upload file to Managed Storage (Supabase)
 */
async function uploadToManaged(supabase, orgId, studentId, file, filename) {
  const fileId = generateFileId();
  const ext = filename.split('.').pop();
  const safeName = `${fileId}.${ext}`;
  const path = `${orgId}/${studentId}/${safeName}`;

  const { data, error } = await supabase.storage
    .from('student-files')
    .upload(path, file.data, {
      contentType: file.type,
      cacheControl: '3600',
      upsert: false,
    });

  if (error) {
    throw new Error(`Failed to upload to managed storage: ${error.message}`);
  }

  const { data: urlData } = supabase.storage
    .from('student-files')
    .getPublicUrl(path);

  return {
    id: fileId,
    path,
    url: urlData.publicUrl,
    storage_provider: 'managed',
  };
}

/**
 * Upload file to BYOS (External S3-compatible storage)
 * This is a placeholder - actual implementation depends on specific provider
 */
async function uploadToBYOS(byosConfig, orgId, studentId, file, filename) {
  const fileId = generateFileId();
  
  // TODO: Implement actual S3/Azure/GCS upload based on provider
  // For now, return a mock structure
  const path = `${orgId}/${studentId}/${fileId}-${filename}`;
  
  return {
    id: fileId,
    path,
    url: `${byosConfig.endpoint}/${byosConfig.bucket}/${path}`,
    storage_provider: 'byos',
  };
}

/**
 * Delete file from Managed Storage
 */
async function deleteFromManaged(supabase, path) {
  const { error } = await supabase.storage
    .from('student-files')
    .remove([path]);

  if (error) {
    throw new Error(`Failed to delete from managed storage: ${error.message}`);
  }
}

/**
 * Delete file from BYOS
 * This is a placeholder - actual implementation depends on specific provider
 */
async function deleteFromBYOS(byosConfig, path) {
  // TODO: Implement actual S3/Azure/GCS deletion based on provider
  console.log('BYOS delete not yet implemented:', path);
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
    context.log?.warn?.('student-files missing bearer token');
    return respond(context, 401, { message: 'missing bearer' });
  }

  const controlClient = createSupabaseAdminClient(adminConfig);

  // Validate token
  let authResult;
  try {
    authResult = await controlClient.auth.getUser(authorization.token);
  } catch (error) {
    context.log?.error?.('student-files failed to validate token', { message: error?.message });
    return respond(context, 401, { message: 'invalid or expired token' });
  }

  if (authResult.error || !authResult.data?.user?.id) {
    return respond(context, 401, { message: 'invalid or expired token' });
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

    // Upload file based on storage mode
    let uploadResult;
    try {
      if (storageProfile.mode === 'managed') {
        uploadResult = await uploadToManaged(controlClient, orgId, studentId, filePart, filePart.filename);
      } else if (storageProfile.mode === 'byos') {
        if (!storageProfile.byos) {
          return respond(context, 400, { message: 'byos_config_missing' });
        }
        uploadResult = await uploadToBYOS(storageProfile.byos, orgId, studentId, filePart, filePart.filename);
      } else {
        return respond(context, 400, { message: 'invalid_storage_mode' });
      }
    } catch (uploadError) {
      context.log?.error?.('File upload failed', { message: uploadError?.message });
      return respond(context, 500, { message: 'file_upload_failed', error: uploadError.message });
    }

    // Create file metadata
    const fileMetadata = {
      id: uploadResult.id,
      name: customName || filePart.filename,
      original_name: filePart.filename,
      url: uploadResult.url,
      path: uploadResult.path,
      storage_provider: uploadResult.storage_provider,
      uploaded_at: new Date().toISOString(),
      uploaded_by: userId,
      definition_id: definitionId || null,
      size: filePart.data.length,
      type: filePart.type || 'application/octet-stream',
    };

    // Get tenant client and update student files
    const tenantClient = await createTenantClient(env, orgId);
    
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
    const updatedFiles = [...currentFiles, fileMetadata];

    // Update student record
    const { error: updateError } = await tenantClient
      .from('Students')
      .update({ files: updatedFiles })
      .eq('id', studentId);

    if (updateError) {
      context.log?.error?.('Failed to update student files', { message: updateError.message });
      return respond(context, 500, { message: 'failed_to_update_student' });
    }

    context.log?.info?.('File uploaded successfully', { fileId: uploadResult.id, studentId });

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

    // Get tenant client
    const tenantClient = await createTenantClient(env, orgId);
    
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

    // Delete physical file
    try {
      if (fileToDelete.storage_provider === 'managed') {
        await deleteFromManaged(controlClient, fileToDelete.path);
      } else if (fileToDelete.storage_provider === 'byos') {
        const { data: orgSettings } = await controlClient
          .from('org_settings')
          .select('storage_profile')
          .eq('org_id', orgId)
          .single();
        
        if (orgSettings?.storage_profile?.byos) {
          await deleteFromBYOS(orgSettings.storage_profile.byos, fileToDelete.path);
        }
      }
    } catch (deleteError) {
      context.log?.warn?.('Failed to delete physical file', { message: deleteError?.message });
      // Continue to remove from database even if physical deletion fails
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
