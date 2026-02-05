/* eslint-env node */
import { resolveBearerAuthorization } from '../_shared/http.js';
import { createSupabaseAdminClient, readSupabaseAdminConfig } from '../_shared/supabase-admin.js';
import {
  ensureMembership,
  normalizeString,
  readEnv,
  respond,
  resolveOrgId,
  resolveTenantClient,
  parseRequestBody,
} from '../_shared/org-bff.js';
import { isUUID } from '../_shared/validation.js';
import {
  fetchServiceById,
  resolveServiceSelection,
  resolveTemplateSelection,
  resolveInheritance,
} from '../_shared/service-recommendations.js';

function isMemberRole(role) {
  const normalized = normalizeString(role).toLowerCase();
  return normalized === 'member';
}

export default async function handler(context, req) {
  const env = readEnv(context);
  const adminConfig = readSupabaseAdminConfig(env);

  if (!adminConfig.supabaseUrl || !adminConfig.serviceRoleKey) {
    context.log?.error?.('session-recommendations missing Supabase admin credentials');
    return respond(context, 500, { message: 'server_misconfigured' });
  }

  const authorization = resolveBearerAuthorization(req);
  if (!authorization?.token) {
    context.log?.warn?.('session-recommendations missing bearer token');
    return respond(context, 401, { message: 'missing bearer' });
  }

  const supabase = createSupabaseAdminClient(adminConfig);

  let authResult;
  try {
    authResult = await supabase.auth.getUser(authorization.token);
  } catch (error) {
    context.log?.error?.('session-recommendations failed to validate token', { message: error?.message });
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
    context.log?.error?.('session-recommendations failed to verify membership', {
      message: membershipError?.message,
      orgId,
      userId,
    });
    return respond(context, 500, { message: 'failed_to_verify_membership' });
  }

  if (!role) {
    return respond(context, 403, { message: 'forbidden' });
  }

  const studentId = normalizeString(body?.student_id || body?.studentId) || null;
  if (studentId && !isUUID(studentId)) {
    return respond(context, 400, { message: 'invalid student id' });
  }

  const { client: tenantClient, error: tenantError } = await resolveTenantClient(context, supabase, env, orgId);
  if (tenantError) {
    return respond(context, tenantError.status, tenantError.body);
  }

  let studentRecord = null;
  if (studentId) {
    const studentResult = await tenantClient
      .from('Students')
      .select('id, assigned_instructor_id, default_service, default_service_id, tags')
      .eq('id', studentId)
      .maybeSingle();

    if (studentResult.error) {
      context.log?.error?.('session-recommendations failed to load student', { message: studentResult.error.message });
      return respond(context, 500, { message: 'failed_to_load_student' });
    }

    if (!studentResult.data) {
      return respond(context, 404, { message: 'student_not_found' });
    }

    studentRecord = studentResult.data;

    if (isMemberRole(role)) {
      const assigned = normalizeString(studentRecord.assigned_instructor_id);
      if (!assigned || assigned !== normalizeString(userId)) {
        return respond(context, 403, { message: 'student_not_assigned_to_user' });
      }
    }
  }

  let selectedService = null;
  let serviceContext = null;
  try {
    const serviceSelection = await resolveServiceSelection({
      tenantClient,
      orgId,
      studentRecord,
      explicitServiceId: body?.service_id || body?.serviceId,
      explicitServiceContext: body?.service_context || body?.serviceContext,
    });

    if (serviceSelection?.error) {
      return respond(context, 400, { message: serviceSelection.error });
    }

    selectedService = serviceSelection.service || null;
    serviceContext = serviceSelection.serviceContext || null;
  } catch (selectionError) {
    context.log?.error?.('session-recommendations failed to resolve service', { message: selectionError?.message });
    return respond(context, 500, { message: 'failed_to_resolve_service' });
  }

  let selectedTemplate = null;
  try {
    const templateSelection = await resolveTemplateSelection({
      tenantClient,
      studentId,
      serviceId: selectedService?.id || null,
      explicitTemplateId: body?.template_id || body?.templateId,
      isLoose: !studentId,
    });

    if (templateSelection?.error) {
      return respond(context, 400, { message: templateSelection.error });
    }

    selectedTemplate = templateSelection.template || null;
  } catch (templateError) {
    context.log?.error?.('session-recommendations failed to resolve template', { message: templateError?.message });
    return respond(context, 500, { message: 'failed_to_resolve_template' });
  }

  if (!selectedService && selectedTemplate?.service_id) {
    try {
      const serviceFromTemplate = await fetchServiceById(tenantClient, selectedTemplate.service_id);
      if (!serviceFromTemplate) {
        return respond(context, 400, { message: 'service_not_found' });
      }
      selectedService = serviceFromTemplate;
      if (!serviceContext) {
        serviceContext = serviceFromTemplate.name || null;
      }
    } catch (serviceError) {
      context.log?.error?.('session-recommendations failed to resolve service from template', { message: serviceError?.message });
      return respond(context, 500, { message: 'failed_to_resolve_service' });
    }
  }

  let inheritance = null;
  try {
    inheritance = await resolveInheritance({
      tenantClient,
      studentId,
      templateId: selectedTemplate?.id || null,
    });
  } catch (inheritError) {
    context.log?.warn?.('session-recommendations failed to resolve inheritance', { message: inheritError?.message });
  }

  return respond(context, 200, {
    service: selectedService
      ? { id: selectedService.id, name: selectedService.name }
      : null,
    template: selectedTemplate
      ? { id: selectedTemplate.id, name: selectedTemplate.name, system_type: selectedTemplate.system_type }
      : null,
    service_context: serviceContext,
    inheritance: inheritance
      ? { id: inheritance.id, date: inheritance.date, content: inheritance.content, template_id: inheritance.template_id }
      : null,
  });
}
