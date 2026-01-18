/* eslint-env node */
import { randomBytes } from 'node:crypto';
import { resolveBearerAuthorization } from '../_shared/http.js';
import { resolvePasswordResetRedirect } from '../_shared/auth-redirect.js';
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
import {
  isEmail,
  parseJsonBodyWithLimit,
  validateInstructorCreate,
  validateInstructorUpdate,
} from '../_shared/validation.js';
import { ensureInstructorColors } from '../_shared/instructor-colors.js';
import { logAuditEvent, AUDIT_ACTIONS, AUDIT_CATEGORIES } from '../_shared/audit-log.js';

const ACTION_SEND_ACTIVATION = 'send_activation';

function generateTemporaryPassword() {
  return `temp_${randomBytes(24).toString('base64url')}`;
}

function resolveNormalizedEmail(value) {
  const normalized = normalizeString(value).toLowerCase();
  if (!normalized) {
    return '';
  }
  return isEmail(normalized) ? normalized : '';
}

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

  if (!role) {
    return respond(context, 403, { message: 'forbidden' });
  }

  const isAdmin = isAdminRole(role);

  const { client: tenantClient, error: tenantError } = await resolveTenantClient(context, supabase, env, orgId);
  if (tenantError) {
    return respond(context, tenantError.status, tenantError.body);
  }

  if (method === 'GET') {
    const colorResult = await ensureInstructorColors(tenantClient, { context });
    if (colorResult?.error) {
      context.log?.error?.('instructors failed to ensure color assignments', { message: colorResult.error.message });
    }

    const includeInactive = normalizeString(req?.query?.include_inactive).toLowerCase() === 'true';

    let builder = tenantClient
      .from('Instructors')
      .select('id, name, email, phone, is_active, notes, metadata, instructor_types')
      .order('name', { ascending: true });

    if (!includeInactive) {
      builder = builder.eq('is_active', true);
    }

    // Non-admin users can only fetch their own instructor record
    if (!isAdmin) {
      builder = builder.eq('id', userId);
    }

    const { data, error } = await builder;

    if (error) {
      context.log?.error?.('instructors failed to fetch roster', { message: error.message });
      return respond(context, 500, { message: 'failed_to_load_instructors' });
    }

    return respond(context, 200, Array.isArray(data) ? data : []);
  }

  if (method === 'POST') {
    // Only admins can create instructors
    if (!isAdmin) {
      return respond(context, 403, { message: 'forbidden' });
    }

    const action = normalizeString(body?.action).toLowerCase();
    if (action === ACTION_SEND_ACTIVATION) {
      const targetEmail = resolveNormalizedEmail(body?.email);
      if (!targetEmail) {
        return respond(context, 400, { message: 'missing_email' });
      }

      const redirectTo = resolvePasswordResetRedirect(context, req);
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        targetEmail,
        redirectTo ? { redirectTo } : undefined,
      );

      if (resetError) {
        context.log?.error?.('instructors failed to send activation email', { message: resetError.message });
        return respond(context, 500, { message: 'failed_to_send_activation' });
      }

      try {
        const { data: existingInstructor } = await tenantClient
          .from('Instructors')
          .select('id, metadata')
          .eq('email', targetEmail)
          .maybeSingle();

        if (existingInstructor?.id) {
          const baseMetadata = existingInstructor.metadata && typeof existingInstructor.metadata === 'object'
            ? existingInstructor.metadata
            : {};
          const nextMetadata = {
            ...baseMetadata,
            activation_last_sent_at: new Date().toISOString(),
          };
          await tenantClient
            .from('Instructors')
            .update({ metadata: nextMetadata })
            .eq('id', existingInstructor.id);
        }
      } catch (error) {
        context.log?.warn?.('instructors failed to store activation metadata', { message: error?.message });
      }

      return respond(context, 200, { message: 'activation_sent' });
    }

    const validation = validateInstructorCreate(body);
    if (validation.error) {
      return respond(context, 400, { message: validation.error });
    }

    const createPlaceholder = validation.createPlaceholder;
    const targetUserId = validation.userId;

    const providedName = validation.name;
    const providedEmail = validation.email;
    const providedPhone = validation.phone;
    const notes = validation.notes;
    let createdUserId = targetUserId;
    let profileName = '';
    let profileEmail = '';
    let placeholderMetadata = createPlaceholder ? {
      placeholder: true,
      placeholder_created_at: new Date().toISOString(),
      placeholder_created_by: userId,
    } : {};

    if (!createdUserId) {
      if (!providedEmail) {
        return respond(context, 400, { message: 'missing_email' });
      }

      let resolvedUser = null;
      try {
        const { data, error } = await supabase.auth.admin.getUserByEmail(providedEmail);
        if (error) {
          context.log?.warn?.('instructors failed to lookup user by email', { message: error.message });
        }
        resolvedUser = data?.user ?? null;
      } catch (error) {
        context.log?.warn?.('instructors failed to lookup user by email', { message: error?.message });
      }

      if (!resolvedUser) {
        const { data: createResult, error: createError } = await supabase.auth.admin.createUser({
          email: providedEmail,
          password: generateTemporaryPassword(),
          email_confirm: true,
          user_metadata: {
            full_name: providedName || undefined,
          },
        });

        if (createError || !createResult?.user?.id) {
          context.log?.error?.('instructors failed to create auth user', { message: createError?.message });
          return respond(context, 500, { message: 'failed_to_create_user' });
        }

        resolvedUser = createResult.user;
      }

      createdUserId = resolvedUser?.id || '';
      profileEmail = normalizeString(resolvedUser?.email).toLowerCase();
      profileName = normalizeString(resolvedUser?.user_metadata?.full_name || '');

      if (!createdUserId) {
        return respond(context, 500, { message: 'failed_to_create_user' });
      }

      const membershipInsert = await supabase
        .from('org_memberships')
        .upsert({ org_id: orgId, user_id: createdUserId, role: 'member' }, { onConflict: 'org_id,user_id' })
        .select('id')
        .maybeSingle();

      if (membershipInsert.error) {
        context.log?.error?.('instructors failed to insert membership', { message: membershipInsert.error.message });
        return respond(context, 500, { message: 'failed_to_add_membership' });
      }

    } else {
      // Verify target user is a member of the org in control DB
      const { data: membership, error: membershipError } = await supabase
        .from('org_memberships')
        .select('user_id')
        .eq('org_id', orgId)
        .eq('user_id', createdUserId)
        .maybeSingle();

      if (membershipError) {
        context.log?.error?.('instructors failed to verify target membership', { message: membershipError.message });
        return respond(context, 500, { message: 'failed_to_verify_target_membership' });
      }

      if (!membership) {
        return respond(context, 400, { message: 'user_not_in_organization' });
      }
    }

    if (!profileEmail || !profileName) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, email, full_name')
          .eq('id', createdUserId)
          .maybeSingle();
        profileName = profileName || normalizeString(profile?.full_name);
        profileEmail = profileEmail || normalizeString(profile?.email).toLowerCase();
      } catch {
        // Intentionally ignore profile fetch errors; fallback to provided values.
      }
    }

    let metadataPayload = null;
    if (createPlaceholder) {
      try {
        const { data: existingInstructor } = await tenantClient
          .from('Instructors')
          .select('id, metadata')
          .eq('id', createdUserId)
          .maybeSingle();
        const baseMetadata = existingInstructor?.metadata && typeof existingInstructor.metadata === 'object'
          ? existingInstructor.metadata
          : {};
        metadataPayload = {
          ...baseMetadata,
          ...placeholderMetadata,
        };
      } catch (error) {
        context.log?.warn?.('instructors failed to read existing metadata', { message: error?.message });
        metadataPayload = { ...placeholderMetadata };
      }
    }

    const insertPayload = {
      id: createdUserId,
      name: providedName || profileName || providedEmail || profileEmail || createdUserId,
      email: providedEmail || profileEmail || null,
      phone: providedPhone || null,
      notes: notes || null,
      is_active: true,
      ...(metadataPayload && Object.keys(metadataPayload).length > 0 ? { metadata: metadataPayload } : {}),
    };

    const { data, error } = await tenantClient
      .from('Instructors')
      .upsert(insertPayload, { onConflict: 'id' })
      .select('id, name, email, phone, is_active, notes, metadata, instructor_types')
      .single();

    if (error) {
      context.log?.error?.('instructors failed to upsert instructor', { message: error.message });
      return respond(context, 500, { message: 'failed_to_save_instructor' });
    }

    if (!createPlaceholder && data?.email) {
      const redirectTo = resolvePasswordResetRedirect(context, req);
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        data.email,
        redirectTo ? { redirectTo } : undefined,
      );

      if (resetError) {
        context.log?.error?.('instructors failed to send activation email', { message: resetError.message });
        return respond(context, 500, { message: 'failed_to_send_activation' });
      }

      try {
        const baseMetadata = data.metadata && typeof data.metadata === 'object' ? data.metadata : {};
        const nextMetadata = {
          ...baseMetadata,
          activation_last_sent_at: new Date().toISOString(),
        };
        await tenantClient
          .from('Instructors')
          .update({ metadata: nextMetadata })
          .eq('id', data.id);
      } catch (error) {
        context.log?.warn?.('instructors failed to store activation metadata', { message: error?.message });
      }
    }

    // Audit log: instructor created
    await logAuditEvent(supabase, {
      orgId,
      userId,
      userEmail: authResult.data.user.email || '',
      userRole: role,
      actionType: AUDIT_ACTIONS.INSTRUCTOR_CREATED,
      actionCategory: AUDIT_CATEGORIES.INSTRUCTORS,
      resourceType: 'instructor',
      resourceId: data.id,
      details: {
        instructor_name: data.name,
        instructor_email: data.email,
        placeholder: createPlaceholder,
      },
    });

    return respond(context, 200, data);
  }

  if (method === 'PUT') {
    // Fetch org permissions for preanswers cap enforcement
    const { data: orgSettings, error: permError } = await supabase
      .from('org_settings')
      .select('permissions')
      .eq('org_id', orgId)
      .maybeSingle();

    if (permError) {
      context.log?.error?.('instructors failed to load permissions', { message: permError.message });
      return respond(context, 500, { message: 'failed_to_load_permissions' });
    }

    let permissions = orgSettings?.permissions;
    if (typeof permissions === 'string') {
      try {
        permissions = JSON.parse(permissions);
      } catch (parseError) {
        context.log?.warn?.('instructors permissions JSON parse failed', { message: parseError?.message });
        permissions = {};
      }
    }

    if (!permissions || typeof permissions !== 'object') {
      permissions = {};
    }

    const validation = validateInstructorUpdate(body, permissions);
    if (validation.error) {
      return respond(context, 400, { message: validation.error });
    }

    const instructorId = validation.instructorId;
    const updates = validation.updates;

    const isSelf = instructorId === userId;
    if (!isAdmin) {
      const allowedKeys = ['__metadata_custom_preanswers'];
      const disallowed = Object.keys(updates).filter((key) => !allowedKeys.includes(key));
      if (disallowed.length || !isSelf) {
        return respond(context, 403, { message: 'forbidden' });
      }
    }

    if (Object.keys(updates).length === 0) {
      return respond(context, 400, { message: 'no updates provided' });
    }

    // Fetch existing instructor to compare changes
    const { data: existingInstructor, error: fetchError } = await tenantClient
      .from('Instructors')
      .select('*')
      .eq('id', instructorId)
      .maybeSingle();

    if (fetchError) {
      context.log?.error?.('instructors failed to fetch existing instructor', { message: fetchError.message, instructorId });
      return respond(context, 500, { message: 'failed_to_fetch_instructor' });
    }

    if (!existingInstructor) {
      return respond(context, 404, { message: 'instructor_not_found' });
    }

    const metadataPatch = updates.__metadata_custom_preanswers;
    if (metadataPatch) {
      delete updates.__metadata_custom_preanswers;
      const existingMeta = existingInstructor.metadata && typeof existingInstructor.metadata === 'object'
        ? existingInstructor.metadata
        : {};
      const nextMeta = { ...existingMeta, custom_preanswers: metadataPatch };
      updates.metadata = nextMeta;
    }

    // Determine which fields actually changed
    const changedFields = [];
    for (const [key, newValue] of Object.entries(updates)) {
      const oldValue = existingInstructor[key];
      const normalizedOld = oldValue === null || oldValue === undefined ? null : oldValue;
      const normalizedNew = newValue === null || newValue === undefined ? null : newValue;
      if (JSON.stringify(normalizedOld) !== JSON.stringify(normalizedNew)) {
        changedFields.push(key);
      }
    }

    const { data, error } = await tenantClient
      .from('Instructors')
      .update(updates)
      .eq('id', instructorId)
      .select('id, name, email, phone, is_active, notes, metadata, instructor_types')
      .maybeSingle();

    if (error) {
      context.log?.error?.('instructors failed to update instructor', { message: error.message, instructorId });
      return respond(context, 500, { message: 'failed_to_update_instructor' });
    }

    if (!data) {
      return respond(context, 404, { message: 'instructor_not_found' });
    }

    // Audit log: instructor updated
    await logAuditEvent(supabase, {
      orgId,
      userId,
      userEmail: authResult.data.user.email || '',
      userRole: role,
      actionType: AUDIT_ACTIONS.INSTRUCTOR_UPDATED,
      actionCategory: AUDIT_CATEGORIES.INSTRUCTORS,
      resourceType: 'instructor',
      resourceId: instructorId,
      details: {
        updated_fields: changedFields,
        instructor_name: data.name,
      },
    });

    return respond(context, 200, data);
  }

  if (method === 'DELETE') {
    // Only admins can delete instructors
    if (!isAdmin) {
      return respond(context, 403, { message: 'forbidden' });
    }

    const instructorId = normalizeString(body?.id || body?.instructor_id || body?.instructorId || '');
    if (!instructorId) {
      return respond(context, 400, { message: 'missing instructor id' });
    }

    const { data, error } = await tenantClient
      .from('Instructors')
      .update({ is_active: false })
      .eq('id', instructorId)
      .select('id, name, email, phone, is_active, notes, metadata, instructor_types')
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
