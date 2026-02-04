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

export default async function handler(context, req) {
  const method = String(req.method || 'GET').toUpperCase();
  if (method !== 'GET') {
    return respond(context, 405, { message: 'method_not_allowed' }, { Allow: 'GET' });
  }

  const env = readEnv(context);
  const adminConfig = readSupabaseAdminConfig(env);

  if (!adminConfig.supabaseUrl || !adminConfig.serviceRoleKey) {
    context.log?.error?.('services missing Supabase admin credentials');
    return respond(context, 500, { message: 'server_misconfigured' });
  }

  const authorization = resolveBearerAuthorization(req);
  if (!authorization?.token) {
    context.log?.warn?.('services missing bearer token');
    return respond(context, 401, { message: 'missing bearer' });
  }

  const supabase = createSupabaseAdminClient(adminConfig);

  let authResult;
  try {
    authResult = await supabase.auth.getUser(authorization.token);
  } catch (error) {
    context.log?.error?.('services failed to validate token', { message: error?.message });
    return respond(context, 401, { message: 'invalid or expired token' });
  }

  if (authResult.error || !authResult.data?.user?.id) {
    return respond(context, 401, { message: 'invalid or expired token' });
  }

  const userId = authResult.data.user.id;
  const body = parseRequestBody(null);
  const orgId = resolveOrgId(req, body);

  if (!orgId) {
    return respond(context, 400, { message: 'invalid org id' });
  }

  let role;
  try {
    role = await ensureMembership(supabase, orgId, userId);
  } catch (membershipError) {
    context.log?.error?.('services failed to verify membership', {
      message: membershipError?.message,
      orgId,
      userId,
    });
    return respond(context, 500, { message: 'failed_to_verify_membership' });
  }

  if (!role) {
    return respond(context, 403, { message: 'forbidden' });
  }

  const includeInactive = normalizeString(req?.query?.include_inactive || req?.query?.includeInactive) === 'true';

  const { client: tenantClient, error: tenantError } = await resolveTenantClient(context, supabase, env, orgId);
  if (tenantError) {
    return respond(context, tenantError.status, tenantError.body);
  }

  let query = tenantClient
    .from('Services')
    .select('id, name, linked_student_tag, is_active')
    .eq('organization_id', orgId)
    .order('name', { ascending: true });

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;

  if (error) {
    context.log?.error?.('services failed to load', { message: error.message });
    return respond(context, 500, { message: 'failed_to_load_services' });
  }

  return respond(context, 200, { services: Array.isArray(data) ? data : [] });
}
