/**
 * Unified Documents API - Polymorphic file management for students, instructors, organizations
 * Replaces: /api/student-files, /api/instructor-files, /api/org-documents
 * 
 * GET    /api/documents?entity_type=student&entity_id={uuid} - List documents
 * POST   /api/documents - Upload document with multipart form data
 * PUT    /api/documents/{id} - Update document metadata
 * DELETE /api/documents/{id} - Delete document
 */

import { createSupabaseAdminClient } from '../_shared/supabase-admin.js';
import { decryptCredentials, checkOrgMembership } from '../_shared/org-bff.js';
import { logAuditEvent, AUDIT_ACTIONS, AUDIT_CATEGORIES } from '../_shared/audit-log.js';
import { createTenantClient } from '../_shared/supabase-tenant.js';
import { parseMultipartData } from 'parse-multipart-data';
import { createHash } from 'crypto';
import { getStorageDriver } from '../_shared/storage-drivers/index.js';

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Validate entity type and permissions
 */
function validateEntityAccess(entityType, userRole, userId, entityId, isAdmin) {
  if (!['student', 'instructor', 'organization'].includes(entityType)) {
    return { valid: false, error: 'invalid_entity_type' };
  }

  // Organization documents: admin/owner only
  if (entityType === 'organization') {
    if (!isAdmin) {
      return { valid: false, error: 'admin_required' };
    }
  }

  // Instructor documents: admin/owner can manage all, instructors only their own
  if (entityType === 'instructor') {
    if (!isAdmin && userId !== entityId) {
      return { valid: false, error: 'permission_denied' };
    }
  }

  // Student documents: all org members can view/upload (controlled via org membership check)

  return { valid: true };
}

/**
 * GET - List documents for an entity
 */
async function handleGet(req, supabase, tenantClient, orgId, userId, userRole, isAdmin) {
  const { entity_type, entity_id } = req.query;

  if (!entity_type || !entity_id) {
    return { status: 400, body: { error: 'entity_type and entity_id required' } };
  }

  const validation = validateEntityAccess(entity_type, userRole, userId, entity_id, isAdmin);
  if (!validation.valid) {
    return { status: 403, body: { error: validation.error } };
  }

  // Fetch documents from Documents table
  const { data: documents, error } = await tenantClient
    .from('Documents')
    .select('*')
    .eq('entity_type', entity_type)
    .eq('entity_id', entity_id)
    .order('uploaded_at', { ascending: false });

  if (error) {
    console.error('Documents fetch error:', error);
    return { status: 500, body: { error: 'fetch_failed', details: error.message } };
  }

  return { status: 200, body: { documents: documents || [] } };
}

/**
 * POST - Upload document
 */
async function handlePost(req, supabase, tenantClient, orgId, userId, userEmail, userRole, isAdmin) {
  const contentType = req.headers['content-type'] || '';
  const boundary = contentType.split('boundary=')[1];

  if (!boundary) {
    return { status: 400, body: { error: 'missing_boundary' } };
  }

  let parts;
  try {
    parts = parseMultipartData(req.body, boundary);
  } catch (err) {
    console.error('Multipart parsing error:', err);
    return { status: 400, body: { error: 'parse_failed' } };
  }

  // Extract metadata
  const entityTypePart = parts.find(p => p.name === 'entity_type');
  const entityIdPart = parts.find(p => p.name === 'entity_id');
  const filePart = parts.find(p => p.name === 'file' && p.filename);
  const customNamePart = parts.find(p => p.name === 'custom_name');
  const relevantDatePart = parts.find(p => p.name === 'relevant_date');
  const expirationDatePart = parts.find(p => p.name === 'expiration_date');
  const definitionIdPart = parts.find(p => p.name === 'definition_id');

  if (!entityTypePart || !entityIdPart || !filePart) {
    return { status: 400, body: { error: 'missing_required_fields' } };
  }

  const entityType = entityTypePart.data.toString('utf8');
  const entityId = entityIdPart.data.toString('utf8');

  // Validate permissions
  const validation = validateEntityAccess(entityType, userRole, userId, entityId, isAdmin);
  if (!validation.valid) {
    return { status: 403, body: { error: validation.error } };
  }

  // Validate file
  const fileBuffer = filePart.data;
  const fileName = filePart.filename;
  const fileType = filePart.type;

  if (fileBuffer.length > MAX_FILE_SIZE) {
    return { status: 413, body: { error: 'file_too_large', max_size: MAX_FILE_SIZE } };
  }

  if (!ALLOWED_MIME_TYPES.includes(fileType)) {
    return { status: 415, body: { error: 'unsupported_file_type', allowed_types: ALLOWED_MIME_TYPES } };
  }

  // Decode Hebrew filename
  let decodedFileName = fileName;
  try {
    // eslint-disable-next-line no-control-regex
    if (fileName.match(/[^\x00-\x7F]/)) {
      const latinBuffer = Buffer.from(fileName, 'latin1');
      decodedFileName = latinBuffer.toString('utf8');
    }
  } catch (err) {
    console.warn('Filename decoding failed, using original:', err);
  }

  // Extract metadata
  const customName = customNamePart ? customNamePart.data.toString('utf8') : null;
  const relevantDate = relevantDatePart ? relevantDatePart.data.toString('utf8') : null;
  const expirationDate = expirationDatePart ? expirationDatePart.data.toString('utf8') : null;
  const definitionId = definitionIdPart ? definitionIdPart.data.toString('utf8') : null;

  // Generate file hash
  const hash = createHash('md5').update(fileBuffer).digest('hex');

  // Get entity name for file naming
  let entityName = '';
  if (entityType === 'student') {
    const { data: student } = await tenantClient.from('Students').select('full_name').eq('id', entityId).single();
    entityName = student?.full_name || 'Unknown';
  } else if (entityType === 'instructor') {
    const { data: instructor } = await tenantClient.from('Instructors').select('full_name').eq('id', entityId).single();
    entityName = instructor?.full_name || 'Unknown';
  }

  // Build final file name
  const ext = decodedFileName.split('.').pop();
  const baseNameWithoutExt = decodedFileName.substring(0, decodedFileName.lastIndexOf('.'));
  const baseName = customName || baseNameWithoutExt;
  const finalName = entityName ? `${baseName} - ${entityName}` : baseName;

  // Get definition name if applicable
  let definitionName = null;
  if (definitionId) {
    const settingsKey = entityType === 'instructor' ? 'instructor_document_definitions' : 'document_definitions';
    const { data: settingsRow } = await tenantClient
      .from('Settings')
      .select('settings_value')
      .eq('key', settingsKey)
      .single();

    if (settingsRow?.settings_value) {
      const definitions = Array.isArray(settingsRow.settings_value) ? settingsRow.settings_value : [];
      const definition = definitions.find(d => d.id === definitionId);
      if (definition) {
        definitionName = definition.name;
      }
    }
  }

  // Load storage profile
  const { data: orgSettings } = await supabase
    .from('org_settings')
    .select('storage_profile')
    .eq('organization_id', orgId)
    .single();

  if (!orgSettings?.storage_profile) {
    return { status: 424, body: { error: 'storage_not_configured' } };
  }

  const storageProfile = orgSettings.storage_profile;

  // Check if storage is disconnected
  if (storageProfile.disconnected) {
    return { status: 403, body: { error: 'storage_disconnected' } };
  }

  // Initialize storage driver
  let driver;
  try {
    driver = getStorageDriver(storageProfile);
  } catch (err) {
    console.error('Storage driver initialization error:', err);
    return { status: 500, body: { error: 'storage_init_failed' } };
  }

  // Build storage path
  let storagePath;
  
  // For managed storage, we'll use a temporary ID; for BYOS, we'll generate the path after insert
  // We need the document ID from DB to build the final path
  const tempDocRecord = {
    entity_type: entityType,
    entity_id: entityId,
    name: finalName,
    original_name: decodedFileName,
    relevant_date: relevantDate || null,
    expiration_date: expirationDate || null,
    resolved: false,
    url: null,
    path: 'temp', // Will update after we get the ID
    storage_provider: storageProfile.mode === 'managed' ? 'managed_r2' : storageProfile.provider,
    uploaded_at: new Date().toISOString(),
    uploaded_by: userId,
    definition_id: definitionId || null,
    definition_name: definitionName,
    size: fileBuffer.length,
    type: fileType,
    hash,
    metadata: null
  };

  // Insert into Documents table first to get auto-generated UUID
  const { data: insertedDoc, error: insertError } = await tenantClient
    .from('Documents')
    .insert([tempDocRecord])
    .select()
    .single();

  if (insertError || !insertedDoc) {
    console.error('Document insert error:', insertError);
    return { status: 500, body: { error: 'insert_failed', details: insertError?.message } };
  }

  const fileId = insertedDoc.id;

  // Now build the correct storage path with the real ID
  if (storageProfile.mode === 'managed') {
    storagePath = `managed/${orgId}/${entityType}s/${entityId}/${fileId}.${ext}`;
  } else {
    storagePath = `${entityType}s/${orgId}/${entityId}/${fileId}.${ext}`;
  }

  // Upload to storage
  try {
    await driver.uploadFile(storagePath, fileBuffer, fileType);
  } catch (err) {
    console.error('Storage upload error:', err);
    // Rollback: delete the document record
    await tenantClient.from('Documents').delete().eq('id', fileId);
    return { status: 500, body: { error: 'upload_failed', details: err.message } };
  }

  // Update the document with the correct path
  const { error: updateError } = await tenantClient
    .from('Documents')
    .update({ path: storagePath })
    .eq('id', fileId);

  if (updateError) {
    console.error('Document path update error:', updateError);
    // Try to clean up storage
    try {
      await driver.deleteFile(storagePath);
    } catch (cleanupErr) {
      console.error('Cleanup error after failed path update:', cleanupErr);
    }
    await tenantClient.from('Documents').delete().eq('id', fileId);
    return { status: 500, body: { error: 'path_update_failed', details: updateError.message } };
  }

  // Audit log
  await logAuditEvent(supabase, {
    orgId,
    userId,
    userEmail,
    userRole,
    actionType: AUDIT_ACTIONS.FILE_UPLOADED,
    actionCategory: AUDIT_CATEGORIES.FILES,
    resourceType: `${entityType}_file`,
    resourceId: fileId,
    details: {
      entity_type: entityType,
      entity_id: entityId,
      file_name: finalName,
      file_size: fileBuffer.length,
      storage_mode: storageProfile.mode
    }
  });

  return { status: 201, body: { file: { ...insertedDoc, path: storagePath } } };
}

/**
 * PUT - Update document metadata
 */
async function handlePut(req, supabase, tenantClient, orgId, userId, userEmail, userRole, isAdmin) {
  const documentId = req.params?.id;
  if (!documentId) {
    return { status: 400, body: { error: 'document_id_required' } };
  }

  const { name, relevant_date, expiration_date, resolved } = req.body;

  // Fetch existing document
  const { data: existingDoc, error: fetchError } = await tenantClient
    .from('Documents')
    .select('*')
    .eq('id', documentId)
    .single();

  if (fetchError || !existingDoc) {
    return { status: 404, body: { error: 'document_not_found' } };
  }

  // Validate permissions
  const validation = validateEntityAccess(existingDoc.entity_type, userRole, userId, existingDoc.entity_id, isAdmin);
  if (!validation.valid) {
    return { status: 403, body: { error: validation.error } };
  }

  // Build update payload
  const updates = {};
  const updatedFields = [];

  if (name !== undefined && name !== existingDoc.name) {
    // eslint-disable-next-line no-restricted-syntax
    updates.name = name;
    updatedFields.push('name');
  }
  if (relevant_date !== undefined && relevant_date !== existingDoc.relevant_date) {
    updates.relevant_date = relevant_date || null;
    updatedFields.push('relevant_date');
  }
  if (expiration_date !== undefined && expiration_date !== existingDoc.expiration_date) {
    updates.expiration_date = expiration_date || null;
    updatedFields.push('expiration_date');
  }
  if (resolved !== undefined && resolved !== existingDoc.resolved) {
    updates.resolved = resolved;
    updatedFields.push('resolved');
  }

  if (Object.keys(updates).length === 0) {
    return { status: 200, body: { message: 'no_changes' } };
  }

  updates.updated_at = new Date().toISOString();

  // Update document
  const { error: updateError } = await tenantClient
    .from('Documents')
    .update(updates)
    .eq('id', documentId);

  if (updateError) {
    console.error('Document update error:', updateError);
    return { status: 500, body: { error: 'update_failed', details: updateError.message } };
  }

  // Audit log
  await logAuditEvent(supabase, {
    orgId,
    userId,
    userEmail,
    userRole,
    actionType: AUDIT_ACTIONS.FILE_METADATA_UPDATED,
    actionCategory: AUDIT_CATEGORIES.FILES,
    resourceType: `${existingDoc.entity_type}_file`,
    resourceId: documentId,
    details: {
      entity_type: existingDoc.entity_type,
      entity_id: existingDoc.entity_id,
      file_name: existingDoc.name,
      updated_fields: updatedFields
    }
  });

  return { status: 200, body: { message: 'updated', updated_fields: updatedFields } };
}

/**
 * DELETE - Remove document
 */
async function handleDelete(req, supabase, tenantClient, orgId, userId, userEmail, userRole, isAdmin) {
  const documentId = req.params?.id;
  if (!documentId) {
    return { status: 400, body: { error: 'document_id_required' } };
  }

  // Fetch existing document
  const { data: existingDoc, error: fetchError } = await tenantClient
    .from('Documents')
    .select('*')
    .eq('id', documentId)
    .single();

  if (fetchError || !existingDoc) {
    return { status: 404, body: { error: 'document_not_found' } };
  }

  // Validate permissions (instructors cannot delete their own files)
  if (existingDoc.entity_type === 'instructor' && !isAdmin) {
    return { status: 403, body: { error: 'admin_required' } };
  }

  const validation = validateEntityAccess(existingDoc.entity_type, userRole, userId, existingDoc.entity_id, isAdmin);
  if (!validation.valid) {
    return { status: 403, body: { error: validation.error } };
  }

  // Load storage profile
  const { data: orgSettings } = await supabase
    .from('org_settings')
    .select('storage_profile')
    .eq('organization_id', orgId)
    .single();

  if (!orgSettings?.storage_profile) {
    return { status: 424, body: { error: 'storage_not_configured' } };
  }

  const storageProfile = orgSettings.storage_profile;

  // Initialize storage driver
  let driver;
  try {
    driver = getStorageDriver(storageProfile);
  } catch (err) {
    console.error('Storage driver initialization error:', err);
    return { status: 500, body: { error: 'storage_init_failed' } };
  }

  // Delete from storage
  try {
    await driver.deleteFile(existingDoc.path);
  } catch (err) {
    console.error('Storage deletion error:', err);
    // Continue with database deletion even if storage fails
  }

  // Delete from Documents table
  const { error: deleteError } = await tenantClient
    .from('Documents')
    .delete()
    .eq('id', documentId);

  if (deleteError) {
    console.error('Document deletion error:', deleteError);
    return { status: 500, body: { error: 'delete_failed', details: deleteError.message } };
  }

  // Audit log
  await logAuditEvent(supabase, {
    orgId,
    userId,
    userEmail,
    userRole,
    actionType: AUDIT_ACTIONS.FILE_DELETED,
    actionCategory: AUDIT_CATEGORIES.FILES,
    resourceType: `${existingDoc.entity_type}_file`,
    resourceId: documentId,
    details: {
      entity_type: existingDoc.entity_type,
      entity_id: existingDoc.entity_id,
      file_name: existingDoc.name,
      file_size: existingDoc.size,
      storage_mode: storageProfile.mode
    }
  });

  return { status: 200, body: { message: 'deleted' } };
}

export default async function handler(req) {
  const method = req.method;

  // Auth check
  const supabase = createSupabaseAdminClient();
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return { status: 401, body: { error: 'missing_auth' } };
  }

  const token = authHeader.substring(7);
  const { data: authResult, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authResult?.user) {
    return { status: 401, body: { error: 'invalid_token' } };
  }

  const userId = authResult.user.id;
  const userEmail = authResult.user.email;

  // Determine org from query or body
  let orgId = req.query?.org_id || req.body?.org_id;
  
  // For GET with entity_id, infer org from entity ownership
  if (!orgId && method === 'GET' && req.query?.entity_id && req.query?.entity_type) {
    // Will validate in membership check
  }

  if (!orgId) {
    return { status: 400, body: { error: 'org_id_required' } };
  }

  // Membership check
  const membership = await checkOrgMembership(supabase, orgId, userId);
  if (!membership) {
    return { status: 403, body: { error: 'not_member' } };
  }

  const userRole = membership.role;
  const isAdmin = ['admin', 'owner'].includes(userRole);

  // Get tenant client
  const { data: orgSettings } = await supabase
    .from('org_settings')
    .select('db_url, db_service_role_key')
    .eq('organization_id', orgId)
    .single();

  if (!orgSettings?.db_url || !orgSettings?.db_service_role_key) {
    return { status: 424, body: { error: 'tenant_not_configured' } };
  }

  const decrypted = decryptCredentials(orgSettings.db_url, orgSettings.db_service_role_key);
  const tenantClient = createTenantClient(decrypted.dbUrl, decrypted.serviceRoleKey);

  // Route to handler
  if (method === 'GET') {
    return await handleGet(req, supabase, tenantClient, orgId, userId, userRole, isAdmin);
  } else if (method === 'POST') {
    return await handlePost(req, supabase, tenantClient, orgId, userId, userEmail, userRole, isAdmin);
  } else if (method === 'PUT') {
    return await handlePut(req, supabase, tenantClient, orgId, userId, userEmail, userRole, isAdmin);
  } else if (method === 'DELETE') {
    return await handleDelete(req, supabase, tenantClient, orgId, userId, userEmail, userRole, isAdmin);
  } else {
    return { status: 405, body: { error: 'method_not_allowed' } };
  }
}
