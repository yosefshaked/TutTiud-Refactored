/* eslint-env node */
import { resolveBearerAuthorization } from '../_shared/http.js';
import { createSupabaseAdminClient, readSupabaseAdminConfig } from '../_shared/supabase-admin.js';
import {
  ensureMembership,
  isAdminRole,
  normalizeString,
  parseRequestBody,
  readEnv,
  respond,
  resolveOrgId,
} from '../_shared/org-bff.js';

function toArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value;
}

export default async function (context, req) {
  const env = readEnv(context);
  const adminConfig = readSupabaseAdminConfig(env);

  if (!adminConfig.supabaseUrl || !adminConfig.serviceRoleKey) {
    context.log?.error?.('instructors missing Supabase admin credentials');
    return respond(context, 500, { message: 'server_misconfigured' });
  }

  const authorization = resolveBearerAuthorization(req);
  if (!authorization?.token) {
    context.log?.warn?.('instructors missing bearer token');
    return respond(context, 401, { message: 'missing bearer' });
  }

  const supabase = createSupabaseAdminClient(adminConfig, {
    global: { headers: { 'Cache-Control': 'no-store' } },
  });

  let authResult;
  try {
    authResult = await supabase.auth.getUser(authorization.token);
  } catch (error) {
    context.log?.error?.('instructors failed to validate token', { message: error?.message });
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
    context.log?.error?.('instructors failed to verify membership', {
      message: membershipError?.message,
      orgId,
      userId,
    });
    return respond(context, 500, { message: 'failed_to_verify_membership' });
  }

  if (!role || !isAdminRole(role)) {
    return respond(context, 403, { message: 'forbidden' });
  }

  const { data: membershipRows, error: membershipError } = await supabase
    .from('org_memberships')
    .select('user_id')
    .eq('org_id', orgId)
    .eq('role', 'member');

  if (membershipError) {
    context.log?.error?.('instructors failed to load membership rows', {
      message: membershipError.message,
      orgId,
    });
    return respond(context, 500, { message: 'failed_to_load_instructors' });
  }

  const instructorIds = Array.from(
    new Set(
      toArray(membershipRows)
        .map((row) => normalizeString(row?.user_id))
        .filter(Boolean),
    ),
  );

  if (instructorIds.length === 0) {
    return respond(context, 200, []);
  }

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', instructorIds);

  if (profilesError) {
    context.log?.error?.('instructors failed to load profiles', {
      message: profilesError.message,
      orgId,
    });
    return respond(context, 500, { message: 'failed_to_load_instructors' });
  }

  const instructorMap = new Map();
  for (const profile of toArray(profiles)) {
    if (!profile || typeof profile !== 'object') {
      continue;
    }
    const id = normalizeString(profile.id);
    if (!id || !instructorIds.includes(id)) {
      continue;
    }
    const name = normalizeString(profile.full_name) || id;
    instructorMap.set(id, { id, name });
  }

  const payload = instructorIds
    .map((id) => instructorMap.get(id) ?? { id, name: id })
    .filter((entry) => Boolean(entry?.id));

  return respond(context, 200, payload);
}
