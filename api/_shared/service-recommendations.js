/* eslint-env node */
import { normalizeString } from './org-bff.js';
import { isUUID } from './validation.js';

const SYSTEM_TYPES = ['INTAKE', 'ONGOING', 'SUMMARY', 'CUSTOM'];

function normalizeTagList(tags) {
  if (!Array.isArray(tags)) return [];
  return tags.map((tag) => normalizeString(tag)).filter((tag) => isUUID(tag));
}

export async function fetchServiceById(tenantClient, serviceId) {
  if (!serviceId || !isUUID(serviceId)) return null;
  const { data, error } = await tenantClient
    .from('Services')
    .select('id, name, linked_student_tag, is_active, organization_id')
    .eq('id', serviceId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function fetchServiceByName(tenantClient, orgId, serviceName) {
  const normalized = normalizeString(serviceName);
  if (!normalized || !orgId) return null;
  const { data, error } = await tenantClient
    .from('Services')
    .select('id, name, linked_student_tag, is_active, organization_id')
    .eq('organization_id', orgId)
    .eq('name', normalized)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function fetchServicesByTags(tenantClient, orgId, tags) {
  if (!orgId || !tags.length) return [];
  const { data, error } = await tenantClient
    .from('Services')
    .select('id, name, linked_student_tag, is_active, organization_id')
    .eq('organization_id', orgId)
    .in('linked_student_tag', tags)
    .eq('is_active', true);

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function fetchTemplateById(tenantClient, templateId) {
  if (!templateId || !isUUID(templateId)) return null;
  const { data, error } = await tenantClient
    .from('ReportTemplates')
    .select('id, service_id, name, system_type, structure_json, display_order, is_active')
    .eq('id', templateId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function fetchTemplateByType(tenantClient, serviceId, systemType) {
  if (!serviceId || !systemType) return null;
  const { data, error } = await tenantClient
    .from('ReportTemplates')
    .select('id, service_id, name, system_type, structure_json, display_order, is_active')
    .eq('service_id', serviceId)
    .eq('system_type', systemType)
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function fetchAnyTemplate(tenantClient, serviceId) {
  if (!serviceId) return null;
  const { data, error } = await tenantClient
    .from('ReportTemplates')
    .select('id, service_id, name, system_type, structure_json, display_order, is_active')
    .eq('service_id', serviceId)
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function countStudentSessionsForService(tenantClient, studentId, serviceId) {
  if (!studentId || !serviceId) return 0;
  const { count, error } = await tenantClient
    .from('SessionRecords')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', studentId)
    .eq('service_id', serviceId);

  if (error) throw error;
  return typeof count === 'number' ? count : 0;
}

async function fetchLatestSessionForTemplate(tenantClient, studentId, templateId) {
  if (!studentId || !templateId) return null;
  const { data, error } = await tenantClient
    .from('SessionRecords')
    .select('id, date, content, service_id, template_id, metadata')
    .eq('student_id', studentId)
    .eq('template_id', templateId)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function resolveServiceSelection({
  tenantClient,
  orgId,
  studentRecord,
  explicitServiceId,
  explicitServiceContext,
}) {
  const legacyServiceContext = normalizeString(explicitServiceContext);
  const normalizedServiceId = normalizeString(explicitServiceId);

  if (normalizedServiceId) {
    const service = await fetchServiceById(tenantClient, normalizedServiceId);
    if (!service || service.is_active === false) {
      return { error: 'service_not_found' };
    }
    return {
      service,
      serviceContext: legacyServiceContext || service.name || null,
      source: 'explicit_id',
    };
  }

  const defaultServiceId = normalizeString(studentRecord?.default_service_id);
  if (defaultServiceId) {
    const service = await fetchServiceById(tenantClient, defaultServiceId);
    if (service && service.is_active !== false) {
      return {
        service,
        serviceContext: legacyServiceContext || service.name || null,
        source: 'student_default',
      };
    }
  }

  const tags = normalizeTagList(studentRecord?.tags);
  if (tags.length > 0) {
    const matchedServices = await fetchServicesByTags(tenantClient, orgId, tags);
    if (matchedServices.length === 1) {
      return {
        service: matchedServices[0],
        serviceContext: legacyServiceContext || matchedServices[0].name || null,
        source: 'tag_match',
      };
    }
  }

  if (legacyServiceContext) {
    const service = await fetchServiceByName(tenantClient, orgId, legacyServiceContext);
    if (service && service.is_active !== false) {
      return {
        service,
        serviceContext: legacyServiceContext,
        source: 'legacy_name',
      };
    }
  }

  return {
    service: null,
    serviceContext: legacyServiceContext || normalizeString(studentRecord?.default_service) || null,
    source: 'none',
  };
}

export async function resolveTemplateSelection({
  tenantClient,
  studentId,
  serviceId,
  explicitTemplateId,
  isLoose,
}) {
  const normalizedTemplateId = normalizeString(explicitTemplateId);

  if (normalizedTemplateId) {
    const template = await fetchTemplateById(tenantClient, normalizedTemplateId);
    if (!template || template.is_active === false) {
      return { error: 'template_not_found' };
    }
    if (serviceId && template.service_id !== serviceId) {
      return { error: 'template_service_mismatch' };
    }
    return {
      template,
      source: 'explicit_id',
    };
  }

  if (!serviceId) {
    return { template: null, source: 'none' };
  }

  const hasStudent = Boolean(studentId) && !isLoose;
  const reportCount = hasStudent
    ? await countStudentSessionsForService(tenantClient, studentId, serviceId)
    : 0;

  const desiredType = reportCount > 0 ? 'ONGOING' : 'INTAKE';
  const template = await fetchTemplateByType(tenantClient, serviceId, desiredType)
    ?? await fetchAnyTemplate(tenantClient, serviceId);

  return {
    template,
    source: template ? (desiredType === template.system_type ? 'auto_type' : 'fallback') : 'none',
  };
}

export async function resolveInheritance({ tenantClient, studentId, templateId }) {
  if (!studentId || !templateId) return null;
  return fetchLatestSessionForTemplate(tenantClient, studentId, templateId);
}

export function isValidSystemType(value) {
  const normalized = normalizeString(value).toUpperCase();
  return SYSTEM_TYPES.includes(normalized);
}
