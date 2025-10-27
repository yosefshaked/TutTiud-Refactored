/* eslint-env node */
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

      // Intentionally ignore profile fetch errors; fallback to provided values.
export default async function (context, req) {
  const method = String(req.method || 'GET').toUpperCase();

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
  const body = parseJsonBodyWithLimit(req, 96 * 1024, { mode: 'observe', context, endpoint: 'instructors' });
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

  const { client: tenantClient, error: tenantError } = await resolveTenantClient(context, supabase, env, orgId);
  if (tenantError) {
    return respond(context, tenantError.status, tenantError.body);
  }

  if (method === 'GET') {
    const includeInactive = normalizeString(req?.query?.include_inactive).toLowerCase() === 'true';

    let builder = tenantClient
      .from('Instructors')
      .select('id, name, email, phone, is_active, notes, metadata')
      .order('name', { ascending: true });

    if (!includeInactive) {
      builder = builder.eq('is_active', true);
    }

    const { data, error } = await builder;

    if (error) {
      context.log?.error?.('instructors failed to fetch roster', { message: error.message });
      return respond(context, 500, { message: 'failed_to_load_instructors' });
    }

    return respond(context, 200, Array.isArray(data) ? data : []);
  }

  if (method === 'POST') {
    const targetUserId = normalizeString(body?.user_id || body?.userId || '');
    if (!targetUserId) {
      return respond(context, 400, { message: 'missing user_id' });
    }

    // Verify target user is a member of the org in control DB
    const { data: membership, error: membershipError } = await supabase
      .from('org_memberships')
      .select('user_id')
      .eq('org_id', orgId)
      .eq('user_id', targetUserId)
      .maybeSingle();

    if (membershipError) {
      context.log?.error?.('instructors failed to verify target membership', { message: membershipError.message });
      return respond(context, 500, { message: 'failed_to_verify_target_membership' });
    }

    if (!membership) {
      return respond(context, 400, { message: 'user_not_in_organization' });
    }

    // Fetch profile defaults if name/email not provided
    const providedName = normalizeString(body?.name);
    const providedEmail = normalizeString(body?.email).toLowerCase();
    const providedPhone = normalizeString(body?.phone);
    const notes = normalizeString(body?.notes);

    let profileName = '';
    let profileEmail = '';
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .eq('id', targetUserId)
        .maybeSingle();
      profileName = normalizeString(profile?.full_name);
      profileEmail = normalizeString(profile?.email).toLowerCase();
    } catch {
      // Intentionally ignore profile fetch errors; fallback to provided values.
    }

    const insertPayload = {
      id: targetUserId,
      name: providedName || profileName || providedEmail || profileEmail || targetUserId,
      email: providedEmail || profileEmail || null,
      phone: providedPhone || null,
      notes: notes || null,
      is_active: true,
    };

    const { data, error } = await tenantClient
      .from('Instructors')
      .upsert(insertPayload, { onConflict: 'id' })
      .select('id, name, email, phone, is_active, notes, metadata')
      .single();

    if (error) {
      context.log?.error?.('instructors failed to upsert instructor', { message: error.message });
      return respond(context, 500, { message: 'failed_to_save_instructor' });
    }

    return respond(context, 200, data);
  }

  if (method === 'PUT') {
    const instructorId = normalizeString(body?.id || body?.instructor_id || body?.instructorId || '');
    if (!instructorId) {
      return respond(context, 400, { message: 'missing instructor id' });
    }

    const updates = {};
    if (Object.prototype.hasOwnProperty.call(body, 'name')) {
      updates['name'] = normalizeString(body.name) || null;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'email')) {
      updates.email = normalizeString(body.email).toLowerCase() || null;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'phone')) {
      updates.phone = normalizeString(body.phone) || null;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'notes')) {
      updates.notes = normalizeString(body.notes) || null;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'is_active')) {
      updates.is_active = Boolean(body.is_active);
    }

    if (Object.keys(updates).length === 0) {
      return respond(context, 400, { message: 'no updates provided' });
    }

    const { data, error } = await tenantClient
      .from('Instructors')
      .update(updates)
      .eq('id', instructorId)
      .select('id, name, email, phone, is_active, notes, metadata')
      .maybeSingle();

    if (error) {
      context.log?.error?.('instructors failed to update instructor', { message: error.message, instructorId });
      return respond(context, 500, { message: 'failed_to_update_instructor' });
    }

    if (!data) {
      return respond(context, 404, { message: 'instructor_not_found' });
    }

    return respond(context, 200, data);
  }

  if (method === 'DELETE') {
    const instructorId = normalizeString(body?.id || body?.instructor_id || body?.instructorId || '');
    if (!instructorId) {
      return respond(context, 400, { message: 'missing instructor id' });
    }

    const { data, error } = await tenantClient
      .from('Instructors')
      .update({ is_active: false })
      .eq('id', instructorId)
      .select('id, name, email, phone, is_active, notes, metadata')
      .maybeSingle();

    if (error) {
      context.log?.error?.('instructors failed to disable instructor', { message: error.message, instructorId });
      return respond(context, 500, { message: 'failed_to_disable_instructor' });
    }

    if (!data) {
      return respond(context, 404, { message: 'instructor_not_found' });
    }

    return respond(context, 200, data);
  }

  return respond(context, 405, { message: 'method_not_allowed' }, { Allow: 'GET,POST,PUT,DELETE' });
}
