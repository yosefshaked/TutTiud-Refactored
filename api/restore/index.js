/* eslint-env node */
import { Buffer } from 'node:buffer';
import { resolveBearerAuthorization } from '../_shared/http.js';
import { createSupabaseAdminClient, readSupabaseAdminConfig } from '../_shared/supabase-admin.js';
import {
  ensureMembership,
  isAdminRole,
  normalizeString,
  readEnv,
  respond,
  resolveOrgId,
  resolveTenantClient,
} from '../_shared/org-bff.js';
import { parseJsonBodyWithLimit } from '../_shared/validation.js';
import { decryptBackup, validateBackupManifest, restoreTenantData } from '../_shared/backup-utils.js';

const MAX_BACKUP_SIZE = 100 * 1024 * 1024; // 100 MB

function checkRestorePermission(orgSettings) {
  if (!orgSettings || !orgSettings.permissions) {
    return { allowed: false, reason: 'restore_not_configured' };
  }

  const permissions = typeof orgSettings.permissions === 'string'
    ? JSON.parse(orgSettings.permissions)
    : orgSettings.permissions;

  if (!permissions.backup_local_enabled) {
    return { allowed: false, reason: 'restore_not_enabled' };
  }

  return { allowed: true };
}

async function appendRestoreHistory(supabase, orgId, entry) {
  const { data: current } = await supabase
    .from('org_settings')
    .select('backup_history')
    .eq('org_id', orgId)
    .maybeSingle();

  const history = current?.backup_history || [];
  const updated = [...history, entry];

  // Keep only last 100 entries
  const trimmed = updated.slice(-100);

  await supabase
    .from('org_settings')
    .update({ backup_history: trimmed })
    .eq('org_id', orgId);
}

export default async function restore(context, req) {
  const env = readEnv(context);
  const adminConfig = readSupabaseAdminConfig(env);

  if (!adminConfig.supabaseUrl || !adminConfig.serviceRoleKey) {
    context.log?.error?.('restore missing Supabase admin credentials');
    return respond(context, 500, { message: 'server_misconfigured' });
  }

  const authorization = resolveBearerAuthorization(req);
  if (!authorization?.token) {
    context.log?.warn?.('restore missing bearer token');
    return respond(context, 401, { message: 'missing bearer' });
  }

  const supabase = createSupabaseAdminClient(adminConfig);

  let authResult;
  try {
    authResult = await supabase.auth.getUser(authorization.token);
  } catch (error) {
    context.log?.error?.('restore failed to validate token', { message: error?.message });
    return respond(context, 401, { message: 'invalid or expired token' });
  }

  if (authResult.error || !authResult.data?.user?.id) {
    return respond(context, 401, { message: 'invalid or expired token' });
  }

  const userId = authResult.data.user.id;
  const body = parseJsonBodyWithLimit(req, MAX_BACKUP_SIZE, { mode: 'enforce', context, endpoint: 'restore' });
  const orgId = resolveOrgId(req, body);

  if (!orgId) {
    return respond(context, 400, { message: 'invalid org id' });
  }

  let role;
  try {
    role = await ensureMembership(supabase, orgId, userId);
  } catch (membershipError) {
    context.log?.error?.('restore failed to verify membership', {
      message: membershipError?.message,
      orgId,
      userId,
    });
    return respond(context, 500, { message: 'failed_to_verify_membership' });
  }

  if (!role || !isAdminRole(role)) {
    return respond(context, 403, { message: 'forbidden' });
  }

  // Check restore permissions
  const { data: orgSettings, error: settingsError } = await supabase
    .from('org_settings')
    .select('permissions')
    .eq('org_id', orgId)
    .maybeSingle();

  if (settingsError) {
    context.log?.error?.('restore failed to load org settings', { message: settingsError.message });
    return respond(context, 500, { message: 'failed_to_load_settings' });
  }

  const permissionCheck = checkRestorePermission(orgSettings);
  if (!permissionCheck.allowed) {
    return respond(context, 403, { message: permissionCheck.reason });
  }

  // Extract encrypted file and password
  const encryptedFile = body?.file; // Base64 or Buffer
  const password = normalizeString(body?.password);
  const clearExisting = Boolean(body?.clear_existing);

  if (!encryptedFile || !password) {
    return respond(context, 400, { message: 'missing_file_or_password' });
  }

  // Convert base64 to Buffer if needed
  let encryptedBuffer;
  if (typeof encryptedFile === 'string') {
    encryptedBuffer = Buffer.from(encryptedFile, 'base64');
  } else if (Buffer.isBuffer(encryptedFile)) {
    encryptedBuffer = encryptedFile;
  } else {
    return respond(context, 400, { message: 'invalid_file_format' });
  }

  // Get tenant client
  const { client: tenantClient, error: tenantError } = await resolveTenantClient(context, supabase, env, orgId);
  if (tenantError) {
    return respond(context, tenantError.status, tenantError.body);
  }

  try {
    // Decrypt
    context.log?.info?.('restore: decrypting backup', { orgId });
    const manifest = await decryptBackup(encryptedBuffer, password);

    // Validate
    const validation = validateBackupManifest(manifest);
    if (!validation.valid) {
      context.log?.warn?.('restore: invalid manifest', { orgId, error: validation.error });
      return respond(context, 400, { message: validation.error });
    }

    // Warn if restoring from different org
    if (manifest.org_id !== orgId) {
      context.log?.warn?.('restore: cross-org restore', { targetOrg: orgId, sourceOrg: manifest.org_id });
    }

    // Restore
    context.log?.info?.('restore: restoring data', { orgId, clearExisting, records: manifest.metadata.total_records });
    const result = await restoreTenantData(tenantClient, manifest, { clearExisting });

    // Record success
    await appendRestoreHistory(supabase, orgId, {
      type: 'restore',
      status: 'completed',
      timestamp: new Date().toISOString(),
      initiated_by: userId,
      source_org_id: manifest.org_id,
      records_restored: result.restored,
    });

    context.log?.info?.('restore: completed', { orgId, restored: result.restored, errors: result.errors.length });

    return respond(context, 200, {
      message: 'restore_completed',
      restored: result.restored,
      errors: result.errors,
    });
  } catch (error) {
    context.log?.error?.('restore: failed', { orgId, message: error?.message });

    await appendRestoreHistory(supabase, orgId, {
      type: 'restore',
      status: 'failed',
      timestamp: new Date().toISOString(),
      initiated_by: userId,
      error_message: error?.message || 'unknown_error',
    });

    const message = error.message === 'Unsupported state or unable to authenticate data'
      ? 'incorrect_password'
      : 'restore_failed';

    return respond(context, 500, { message, error: error?.message });
  }
}
