/* eslint-env node */
import { resolveBearerAuthorization } from '../_shared/http.js';
import { createSupabaseAdminClient, readSupabaseAdminConfig } from '../_shared/supabase-admin.js';
import {
  ensureMembership,
  normalizeString,
  parseRequestBody,
  readEnv,
  respond,
  resolveOrgId,
  resolveTenantClient,
} from '../_shared/org-bff.js';

function parseBoolean(value) {
  if (value === null || value === undefined) {
    return { valid: false, value: false };
  }
  if (typeof value === 'boolean') {
    return { valid: true, value };
  }
  if (typeof value === 'number') {
    if (value === 1) {
      return { valid: true, value: true };
    }
    if (value === 0) {
      return { valid: true, value: false };
    }
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return { valid: false, value: false };
    }
    if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'y' || normalized === 'on') {
      return { valid: true, value: true };
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'n' || normalized === 'off') {
      return { valid: true, value: false };
    }
    return { valid: false, value: false };
  }
  return { valid: false, value: false };
}

function determineStatusFilter(query, canViewInactive) {
  const status = normalizeString(query?.status);
  if (canViewInactive && status === 'inactive') {
    return 'inactive';
  }
  if (canViewInactive && status === 'all') {
    return 'all';
  }
  if (canViewInactive) {
    const includeInactive = query?.include_inactive ?? query?.includeInactive;
    const flag = parseBoolean(includeInactive);
    if (flag.valid && flag.value) {
      return 'all';
    }
  }
  return 'active';
}

export default async function (context, req) {
  const env = readEnv(context);
  const adminConfig = readSupabaseAdminConfig(env);

  if (!adminConfig.supabaseUrl || !adminConfig.serviceRoleKey) {
    context.log?.error?.('my-students missing Supabase admin credentials');
    return respond(context, 500, { message: 'server_misconfigured' });
  }

  const authorization = resolveBearerAuthorization(req);
  if (!authorization?.token) {
    context.log?.warn?.('my-students missing bearer token');
    return respond(context, 401, { message: 'missing bearer' });
  }

  const supabase = createSupabaseAdminClient(adminConfig);

  let authResult;
  try {
    authResult = await supabase.auth.getUser(authorization.token);
  } catch (error) {
    context.log?.error?.('my-students failed to validate token', { message: error?.message });
    return respond(context, 401, { message: 'invalid or expired token' });
  }

  if (authResult.error || !authResult.data?.user?.id) {
    return respond(context, 401, { message: 'invalid or expired token' });
  }

  const userId = authResult.data.user.id;
  const body = parseRequestBody(req);
  const orgId = resolveOrgId(req, body);

  if (!orgId) {
    return respond(context, 400, { message: 'invalid org id' });
  }

  let role;
  try {
    role = await ensureMembership(supabase, orgId, userId);
  } catch (membershipError) {
    context.log?.error?.('my-students failed to verify membership', {
      message: membershipError?.message,
      orgId,
      userId,
    });
    return respond(context, 500, { message: 'failed_to_verify_membership' });
  }

  if (!role) {
    return respond(context, 403, { message: 'forbidden' });
  }

  const { client: tenantClient, error: tenantError } = await resolveTenantClient(context, supabase, env, orgId);
  if (tenantError) {
    return respond(context, tenantError.status, tenantError.body);
  }

  let instructorsCanViewInactive = false;
  try {
    const { data: settingRow, error: settingError } = await tenantClient
      .from('Settings')
      .select('settings_value')
      .eq('key', 'instructors_can_view_inactive_students')
      .maybeSingle();

    if (!settingError && settingRow && typeof settingRow.settings_value === 'boolean') {
      instructorsCanViewInactive = settingRow.settings_value === true;
    }
  } catch (settingsError) {
    context.log?.warn?.('my-students failed to read inactive visibility setting', {
      message: settingsError?.message,
      orgId,
    });
  }

  const statusFilter = determineStatusFilter(req?.query, instructorsCanViewInactive);

  let builder = tenantClient
    .from('Students')
    .select('*')
    .eq('assigned_instructor_id', normalizeString(userId))
    .order('name', { ascending: true });

  if (statusFilter === 'active') {
    builder = builder.eq('is_active', true);
  } else if (statusFilter === 'inactive') {
    builder = builder.eq('is_active', false);
  }

  const { data, error } = await builder;

  if (error) {
    context.log?.error?.('my-students failed to fetch assigned roster', { message: error.message });
    return respond(context, 500, { message: 'failed_to_load_students' });
  }

  return respond(context, 200, Array.isArray(data) ? data : []);
}
