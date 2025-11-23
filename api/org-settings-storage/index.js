/* eslint-env node */
/**
 * Organization Storage Profile API
 * 
 * Cross-system storage configuration endpoint.
 * 
 * GET: Read storage profile (all org members)
 * POST: Update storage profile (admin/owner only)
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
import {
  validateStorageProfile,
  normalizeStorageProfile,
} from '../cross-platform/storage-config/index.js';
import { logAuditEvent, AUDIT_ACTIONS, AUDIT_CATEGORIES } from '../_shared/audit-log.js';

export default async function (context, req) {
  context.log?.info?.('org-settings/storage: request received', { method: req.method });

  const env = readEnv(context);
  const adminConfig = readSupabaseAdminConfig(env);
  if (!adminConfig.supabaseUrl || !adminConfig.serviceRoleKey) {
    context.log?.error?.('org-settings/storage missing Supabase admin credentials');
    return respond(context, 500, { message: 'server_misconfigured' });
  }

  const authorization = resolveBearerAuthorization(req);
  if (!authorization?.token) {
    context.log?.warn?.('org-settings/storage missing bearer token');
    return respond(context, 401, { message: 'missing bearer' });
  }

  const supabase = createSupabaseAdminClient(adminConfig);

  // Validate token
  let authResult;
  try {
    authResult = await supabase.auth.getUser(authorization.token);
  } catch (error) {
    context.log?.error?.('org-settings/storage failed to validate token', { message: error?.message });
    return respond(context, 401, { message: 'invalid or expired token' });
  }

  if (authResult.error || !authResult.data?.user?.id) {
    return respond(context, 401, { message: 'invalid or expired token' });
  }

  const userId = authResult.data.user.id;

  // Parse request body for POST
  const body = parseRequestBody(req);
  const orgId = resolveOrgId(req, body);
  if (!orgId) {
    return respond(context, 400, { message: 'invalid org id' });
  }

  // Verify membership
  let role;
  try {
    role = await ensureMembership(supabase, orgId, userId);
  } catch (membershipError) {
    context.log?.error?.('org-settings/storage failed to verify membership', {
      message: membershipError?.message,
      orgId,
      userId,
    });
    return respond(context, 500, { message: 'failed_to_verify_membership' });
  }

  if (!role) {
    return respond(context, 403, { message: 'not_a_member' });
  }

  // GET: All org members can read storage profile
  if (req.method === 'GET') {
    const { data: orgSettings, error } = await supabase
      .from('org_settings')
      .select('storage_profile')
      .eq('org_id', orgId)
      .maybeSingle();

    if (error) {
      context.log?.error?.('org-settings/storage failed to load storage_profile', { 
        message: error.message,
        orgId,
      });
      return respond(context, 500, { message: 'failed_to_load_storage_profile' });
    }

    const storageProfile = orgSettings?.storage_profile || null;

    context.log?.info?.('org-settings/storage loaded successfully', { 
      orgId,
      hasProfile: Boolean(storageProfile),
      mode: storageProfile?.mode || null,
    });

    return respond(context, 200, {
      storage_profile: storageProfile,
    }, { 'Cache-Control': 'private, max-age=60' });
  }

  // POST: Admin/Owner only can update storage profile
  if (req.method === 'POST') {
    if (!isAdminRole(role)) {
      context.log?.warn?.('org-settings/storage non-admin attempted update', { orgId, userId, role });
      return respond(context, 403, { message: 'admin_or_owner_required' });
    }

    const rawProfile = body?.storage_profile;
    if (!rawProfile) {
      return respond(context, 400, { message: 'missing_storage_profile' });
    }

    // Normalize the profile
    const normalizedProfile = normalizeStorageProfile(rawProfile);
    if (!normalizedProfile) {
      return respond(context, 400, { 
        message: 'invalid_storage_profile_structure',
        details: 'Storage profile must be an object with valid mode and configuration',
      });
    }

    // Validate the normalized profile
    const validation = validateStorageProfile(normalizedProfile);
    if (!validation.valid) {
      context.log?.warn?.('org-settings/storage validation failed', {
        orgId,
        userId,
        errors: validation.errors,
      });
      return respond(context, 400, {
        message: 'validation_failed',
        errors: validation.errors,
      });
    }

    // Add metadata
    const profileToSave = {
      ...normalizedProfile,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    };

    // Update the existing org_settings row (row must exist if user can access the app)
    const { error: updateError } = await supabase
      .from('org_settings')
      .update({
        storage_profile: profileToSave,
        updated_at: new Date().toISOString(),
      })
      .eq('org_id', orgId);

    if (updateError) {
      context.log?.error?.('org-settings/storage failed to save storage_profile', {
        message: updateError.message,
        code: updateError.code,
        orgId,
        userId,
      });
      return respond(context, 500, { message: 'failed_to_save_storage_profile' });
    }

    context.log?.info?.('org-settings/storage updated successfully', {
      orgId,
      userId,
      mode: profileToSave.mode,
    });

    // Log audit event
    try {
      await logAuditEvent(supabase, {
        orgId,
        userId,
        userEmail: authResult.data.user.email,
        userRole: role,
        actionType: AUDIT_ACTIONS.STORAGE_CONFIGURED,
        actionCategory: AUDIT_CATEGORIES.STORAGE,
        resourceType: 'storage_profile',
        resourceId: orgId,
        details: {
          mode: profileToSave.mode,
          provider: profileToSave.mode === 'byos' ? profileToSave.byos?.provider : 'managed',
        },
      });
    } catch (auditError) {
      context.log?.error?.('Failed to log audit event', { message: auditError.message });
    }

    return respond(context, 200, {
      storage_profile: profileToSave,
    });
  }

  // DELETE: Admin/Owner only can disconnect (remove) storage configuration
  if (req.method === 'DELETE') {
    if (!isAdminRole(role)) {
      context.log?.warn?.('org-settings/storage non-admin attempted delete', { orgId, userId, role });
      return respond(context, 403, { message: 'admin_or_owner_required' });
    }

    // Remove storage_profile by setting it to null
    const { error: deleteError } = await supabase
      .from('org_settings')
      .update({
        storage_profile: null,
        updated_at: new Date().toISOString(),
      })
      .eq('org_id', orgId);

    if (deleteError) {
      context.log?.error?.('org-settings/storage failed to disconnect storage', {
        message: deleteError.message,
        code: deleteError.code,
        orgId,
        userId,
      });
      return respond(context, 500, { message: 'failed_to_disconnect_storage' });
    }

    context.log?.info?.('org-settings/storage disconnected successfully', {
      orgId,
      userId,
    });

    // Log audit event
    try {
      await logAuditEvent(supabase, {
        orgId,
        userId,
        userEmail: authResult.data.user.email,
        userRole: role,
        actionType: AUDIT_ACTIONS.STORAGE_DISCONNECTED,
        actionCategory: AUDIT_CATEGORIES.STORAGE,
        resourceType: 'storage_profile',
        resourceId: orgId,
        details: {
          previous_mode: orgSettings?.storage_profile?.mode,
        },
      });
    } catch (auditError) {
      context.log?.error?.('Failed to log audit event', { message: auditError.message });
    }

    return respond(context, 200, {
      message: 'storage_disconnected',
    });
  }

  return respond(context, 405, { message: 'method_not_allowed' });
}
