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
    .select('id, name, linked_student_tag, is_active')
    .eq('id', serviceId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function fetchServiceByName(tenantClient, orgId, serviceName) {
  const normalized = normalizeString(serviceName);
  if (!normalized) return null;
  const { data, error } = await tenantClient
    .from('Services')
    .select('id, name, linked_student_tag, is_active')
    .ilike('name', normalized)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function fetchServicesByTags(tenantClient, orgId, tags) {
  if (!tags.length) return [];
  const { data, error } = await tenantClient
    .from('Services')
    .select('id, name, linked_student_tag, is_active')
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

async function fetchLatestSessionSystemType(tenantClient, studentId, serviceId, serviceContext) {
  if (!studentId) return null;
  
  // First try to find by service_id (new schema)
  if (serviceId) {
    const { data, error } = await tenantClient
      .from('SessionRecords')
      .select(`
        id,
        date,
        template_id,
        ReportTemplates (
          system_type
        )
      `)
      .eq('student_id', studentId)
      .eq('service_id', serviceId)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (data) return data.ReportTemplates?.system_type || 'LEGACY';
  }

  // Fallback to service_context (old schema, backwards compatibility)
  if (serviceContext) {
    const { data, error } = await tenantClient
      .from('SessionRecords')
      .select(`
        id,
        date,
        template_id,
        ReportTemplates (
          system_type
        )
      `)
      .eq('student_id', studentId)
      .eq('service_context', serviceContext)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (data) return data.ReportTemplates?.system_type || 'LEGACY';
  }

  return null;
}

export async function resolveServiceSelection({
  tenantClient,
  orgId,
  studentRecord,
  explicitServiceId,
  explicitServiceContext,
}) {
  const legacyServiceContext = normalizeString(explicitServiceContext);
  const studentDefaultService = normalizeString(studentRecord?.default_service);
  const contextToUse = legacyServiceContext || studentDefaultService;
  const normalizedServiceId = normalizeString(explicitServiceId);

  if (normalizedServiceId) {
    const service = await fetchServiceById(tenantClient, normalizedServiceId);
    if (!service || service.is_active === false) {
      return { error: 'service_not_found' };
    }
    return {
      service,
      serviceContext: contextToUse || service.name || null,
      source: 'explicit_id',
    };
  }

  const defaultServiceId = normalizeString(studentRecord?.default_service_id);
  if (defaultServiceId) {
    const service = await fetchServiceById(tenantClient, defaultServiceId);
    if (service && service.is_active !== false) {
      return {
        service,
        serviceContext: contextToUse || service.name || null,
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
        serviceContext: contextToUse || matchedServices[0].name || null,
        source: 'tag_match',
      };
    }
  }

  if (contextToUse) {
    const service = await fetchServiceByName(tenantClient, orgId, contextToUse);
    if (service && service.is_active !== false) {
      return {
        service,
        serviceContext: contextToUse,
        source: 'legacy_name',
      };
    }
  }

  return {
    service: null,
    serviceContext: contextToUse || null,
    source: 'none',
  };
}

export async function resolveTemplateSelection({
  tenantClient,
  studentId,
  serviceId,
  explicitTemplateId,
  isLoose,
  serviceContext,
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
  let desiredType = 'INTAKE';

  if (hasStudent) {
    const latestSystemType = await fetchLatestSessionSystemType(tenantClient, studentId, serviceId, serviceContext);
    if (latestSystemType) {
      // If the last report was a SUMMARY, the next one should be an INTAKE
      if (latestSystemType === 'SUMMARY') {
        desiredType = 'INTAKE';
      } else {
        desiredType = 'ONGOING';
      }
    }
  }

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
