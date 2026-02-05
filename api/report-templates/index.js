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
  resolveTenantClient,
} from '../_shared/org-bff.js';
import { isUUID } from '../_shared/validation.js';
import { SYSTEM_TEMPLATES, buildSystemTemplates } from '../_shared/report-templates-defaults.js';

export default async function handler(context, req) {
  const method = String(req.method || 'GET').toUpperCase();
  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(method)) {
    return respond(context, 405, { message: 'method_not_allowed' }, { Allow: 'GET,POST,PUT,DELETE' });
  }

  const env = readEnv(context);
  const adminConfig = readSupabaseAdminConfig(env);

  if (!adminConfig.supabaseUrl || !adminConfig.serviceRoleKey) {
    context.log?.error?.('report-templates missing Supabase admin credentials');
    return respond(context, 500, { message: 'server_misconfigured' });
  }

  const authorization = resolveBearerAuthorization(req);
  if (!authorization?.token) {
    context.log?.warn?.('report-templates missing bearer token');
    return respond(context, 401, { message: 'missing bearer' });
  }

  const supabase = createSupabaseAdminClient(adminConfig);

  let authResult;
  try {
    authResult = await supabase.auth.getUser(authorization.token);
  } catch (error) {
    context.log?.error?.('report-templates failed to validate token', { message: error?.message });
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
    context.log?.error?.('report-templates failed to verify membership', {
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

  if (method === 'GET') {
    const serviceId = normalizeString(req?.query?.service_id || req?.query?.serviceId);
    if (!serviceId || !isUUID(serviceId)) {
      return respond(context, 400, { message: 'invalid service id' });
    }

    const includeInactive = normalizeString(req?.query?.include_inactive || req?.query?.includeInactive) === 'true';

    let query = tenantClient
      .from('ReportTemplates')
      .select('id, service_id, name, system_type, display_order, is_active, metadata, structure_json')
      .eq('service_id', serviceId)
      .order('display_order', { ascending: true });

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
      context.log?.error?.('report-templates failed to load', { message: error.message });
      return respond(context, 500, { message: 'failed_to_load_templates' });
    }

    return respond(context, 200, { templates: Array.isArray(data) ? data : [] });
  }

  if (!isAdminRole(role)) {
    return respond(context, 403, { message: 'insufficient_permissions' });
  }

  if (method === 'POST') {
    const action = normalizeString(body?.action);
    const serviceId = normalizeString(body?.service_id || body?.serviceId);
    if (!serviceId || !isUUID(serviceId)) {
      return respond(context, 400, { message: 'invalid service id' });
    }

    if (action === 'ensure_system') {
      const existing = await tenantClient
        .from('ReportTemplates')
        .select('id, system_type')
        .eq('service_id', serviceId)
        .in('system_type', SYSTEM_TEMPLATES);

      if (existing.error) {
        context.log?.error?.('report-templates failed to check existing system templates', { message: existing.error.message });
        return respond(context, 500, { message: 'failed_to_check_templates' });
      }

      const existingTypes = new Set((existing.data || []).map((row) => row.system_type));
      const templatesToCreate = buildSystemTemplates(serviceId).filter((template) => !existingTypes.has(template.system_type));

      if (templatesToCreate.length === 0) {
        return respond(context, 200, { created: [] });
      }

      const { data, error } = await tenantClient
        .from('ReportTemplates')
        .insert(templatesToCreate)
        .select('id, service_id, name, system_type, display_order, is_active, metadata');

      if (error) {
        context.log?.error?.('report-templates failed to create system templates', { message: error.message });
        return respond(context, 500, { message: 'failed_to_create_templates' });
      }

      return respond(context, 201, { created: Array.isArray(data) ? data : [] });
    }

    if (action === 'create_custom') {
      const baseTemplateId = normalizeString(body?.base_template_id || body?.baseTemplateId);
      const name = normalizeString(body?.name) || 'תבנית מותאמת';
      const requestedSystemType = normalizeString(body?.system_type || body?.systemType).toUpperCase();
      let baseTemplate = null;

      if (baseTemplateId) {
        const baseResult = await tenantClient
          .from('ReportTemplates')
          .select('id, structure_json, system_type')
          .eq('id', baseTemplateId)
          .maybeSingle();

        if (baseResult.error) {
          context.log?.error?.('report-templates failed to load base template', { message: baseResult.error.message });
          return respond(context, 500, { message: 'failed_to_load_base_template' });
        }

        baseTemplate = baseResult.data || null;
      }

      const allowedTypes = new Set([...SYSTEM_TEMPLATES, 'CUSTOM']);
      const baseSystemType = baseTemplate?.system_type || null;
      const resolvedSystemType = allowedTypes.has(requestedSystemType)
        ? requestedSystemType
        : (allowedTypes.has(baseSystemType) ? baseSystemType : 'CUSTOM');

      const payload = {
        service_id: serviceId,
        name,
        system_type: resolvedSystemType,
        structure_json: baseTemplate?.structure_json || body?.structure_json || { questions: [] },
        display_order: typeof body?.display_order === 'number' ? body.display_order : 999,
        is_active: true,
        metadata: {
          is_system: false,
          base_template_id: baseTemplate?.id || null,
          base_system_type: baseSystemType,
        },
      };

      const { data, error } = await tenantClient
        .from('ReportTemplates')
        .insert([payload])
        .select('id, service_id, name, system_type, display_order, is_active, metadata');

      if (error) {
        context.log?.error?.('report-templates failed to create custom template', { message: error.message });
        return respond(context, 500, { message: 'failed_to_create_template' });
      }

      return respond(context, 201, { template: Array.isArray(data) ? data[0] : data });
    }

    return respond(context, 400, { message: 'invalid_action' });
  }

  if (method === 'PUT') {
    const templateId = normalizeString(body?.id || body?.template_id || body?.templateId);
    if (!templateId || !isUUID(templateId)) {
      return respond(context, 400, { message: 'invalid template id' });
    }

    const updates = {};
    if (Object.prototype.hasOwnProperty.call(body, 'name')) {
      updates['name'] = normalizeString(body?.name) || null;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'structure_json')) {
      updates.structure_json = body.structure_json;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'display_order')) {
      updates.display_order = body.display_order;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'is_active')) {
      updates.is_active = Boolean(body.is_active);
    }

    const { data, error } = await tenantClient
      .from('ReportTemplates')
      .update(updates)
      .eq('id', templateId)
      .select('id, service_id, name, system_type, display_order, is_active, metadata');

    if (error) {
      context.log?.error?.('report-templates failed to update template', { message: error.message });
      return respond(context, 500, { message: 'failed_to_update_template' });
    }

    return respond(context, 200, { template: Array.isArray(data) ? data[0] : data });
  }

  if (method === 'DELETE') {
    const templateId = normalizeString(body?.id || body?.template_id || body?.templateId);
    if (!templateId || !isUUID(templateId)) {
      return respond(context, 400, { message: 'invalid template id' });
    }

    const templateResult = await tenantClient
      .from('ReportTemplates')
      .select('id, metadata')
      .eq('id', templateId)
      .maybeSingle();

    if (templateResult.error) {
      context.log?.error?.('report-templates failed to load template for delete', { message: templateResult.error.message });
      return respond(context, 500, { message: 'failed_to_load_template' });
    }

    if (templateResult.data?.metadata?.is_system) {
      return respond(context, 400, { message: 'cannot_delete_system_template' });
    }

    const { error } = await tenantClient
      .from('ReportTemplates')
      .delete()
      .eq('id', templateId);

    if (error) {
      context.log?.error?.('report-templates failed to delete template', { message: error.message });
      return respond(context, 500, { message: 'failed_to_delete_template' });
    }

    return respond(context, 200, { success: true });
  }

  return respond(context, 405, { message: 'method_not_allowed' }, { Allow: 'GET,POST,PUT,DELETE' });
}
