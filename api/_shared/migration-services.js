/**
 * Multi-Service Dynamic Reports - Migration Service
 * 
 * This module provides in-app migration from legacy string-based services
 * to the new relational Services/ReportTemplates model.
 * 
 * Usage:
 *   import { migrateLegacyServicesToRelational } from './_shared/migration-services.js';
 *   const report = await migrateLegacyServicesToRelational(tenantClient, orgId);
 */

/**
 * Check if the Services table exists in the database
 * @param {Object} tenantClient - Supabase client for tenant database
 * @returns {Promise<boolean>} True if Services table exists
 */
async function checkServicesTableExists(tenantClient) {
  const { data, error } = await tenantClient.rpc('pg_table_exists', {
    schema_name: 'tuttiud',
    table_name: 'Services'
  });
  
  if (error) {
    // Fallback: Try to query the table directly
    const { error: queryError } = await tenantClient
      .from('Services')
      .select('id')
      .limit(1);
    
    return !queryError || !queryError.message.includes('does not exist');
  }
  
  return Boolean(data);
}

/**
 * Extract unique service names from existing SessionRecords and Students
 * @param {Object} tenantClient - Supabase client for tenant database
 * @returns {Promise<Array<{name: string, sources: string[], count: number}>>}
 */
async function extractUniqueServiceNames(tenantClient) {
  const serviceCounts = new Map();
  
  // Get services from SessionRecords
  const { data: sessionRecords, error: sessionError } = await tenantClient
    .from('SessionRecords')
    .select('service_context')
    .not('service_context', 'is', null)
    .neq('service_context', '');
  
  if (sessionError && !sessionError.message.includes('does not exist')) {
    throw new Error(`Failed to query SessionRecords: ${sessionError.message}`);
  }
  
  if (sessionRecords) {
    for (const record of sessionRecords) {
      const name = record.service_context?.trim();
      if (name) {
        const entry = serviceCounts.get(name) || { name, sources: new Set(), count: 0 };
        entry.sources.add('SessionRecords');
        entry.count++;
        serviceCounts.set(name, entry);
      }
    }
  }
  
  // Get services from Students
  const { data: students, error: studentError } = await tenantClient
    .from('Students')
    .select('default_service')
    .not('default_service', 'is', null)
    .neq('default_service', '');
  
  if (studentError && !studentError.message.includes('does not exist')) {
    throw new Error(`Failed to query Students: ${studentError.message}`);
  }
  
  if (students) {
    for (const student of students) {
      const name = student.default_service?.trim();
      if (name) {
        const entry = serviceCounts.get(name) || { name, sources: new Set(), count: 0 };
        entry.sources.add('Students');
        entry.count++;
        serviceCounts.set(name, entry);
      }
    }
  }
  
  // Convert to array and sort by count
  return Array.from(serviceCounts.values())
    .map(entry => ({
      name: entry.name,
      sources: Array.from(entry.sources),
      count: entry.count
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Create Service records for unique service names
 * @param {Object} tenantClient - Supabase client for tenant database
 * @param {string} orgId - Organization ID
 * @param {Array<{name: string}>} services - Array of service objects
 * @returns {Promise<Map<string, string>>} Map of service_name -> service_id
 */
async function createServiceRecords(tenantClient, orgId, services) {
  const serviceMap = new Map();
  
  for (const service of services) {
    // Check if service already exists
    const { data: existing, error: checkError } = await tenantClient
      .from('Services')
      .select('id')
      .eq('organization_id', orgId)
      .eq('name', service.name)
      .maybeSingle();
    
    if (checkError) {
      throw new Error(`Failed to check existing service: ${checkError.message}`);
    }
    
    if (existing) {
      serviceMap.set(service.name, existing.id);
      continue;
    }
    
    // Create new service
    const { data: newService, error: createError } = await tenantClient
      .from('Services')
      .insert({
        organization_id: orgId,
        name: service.name,
        is_active: true,
        metadata: {
          created_via: 'migration',
          migrated_at: new Date().toISOString()
        }
      })
      .select('id')
      .single();
    
    if (createError) {
      throw new Error(`Failed to create service "${service.name}": ${createError.message}`);
    }
    
    serviceMap.set(service.name, newService.id);
  }
  
  return serviceMap;
}

/**
 * Update SessionRecords to link to Services
 * @param {Object} tenantClient - Supabase client for tenant database
 * @param {Map<string, string>} serviceMap - Map of service_name -> service_id
 * @returns {Promise<{updated: number, skipped: number}>}
 */
async function linkSessionRecordsToServices(tenantClient, serviceMap) {
  let updated = 0;
  let skipped = 0;
  
  for (const [serviceName, serviceId] of serviceMap.entries()) {
    // Update records that match this service name and don't already have a service_id
    const { data, error } = await tenantClient
      .from('SessionRecords')
      .update({ service_id: serviceId })
      .eq('service_context', serviceName)
      .is('service_id', null)
      .select('id');
    
    if (error) {
      console.error(`Failed to update SessionRecords for "${serviceName}":`, error.message);
      skipped++;
      continue;
    }
    
    updated += (data?.length || 0);
  }
  
  // Count how many records still don't have service_id
  const { count: remainingCount } = await tenantClient
    .from('SessionRecords')
    .select('id', { count: 'exact', head: true })
    .not('service_context', 'is', null)
    .neq('service_context', '')
    .is('service_id', null);
  
  skipped += (remainingCount || 0);
  
  return { updated, skipped };
}

/**
 * Update Students to link to Services
 * @param {Object} tenantClient - Supabase client for tenant database
 * @param {Map<string, string>} serviceMap - Map of service_name -> service_id
 * @returns {Promise<{updated: number, skipped: number}>}
 */
async function linkStudentsToServices(tenantClient, serviceMap) {
  let updated = 0;
  let skipped = 0;
  
  for (const [serviceName, serviceId] of serviceMap.entries()) {
    // Update records that match this service name and don't already have a default_service_id
    const { data, error } = await tenantClient
      .from('Students')
      .update({ default_service_id: serviceId })
      .eq('default_service', serviceName)
      .is('default_service_id', null)
      .select('id');
    
    if (error) {
      console.error(`Failed to update Students for "${serviceName}":`, error.message);
      skipped++;
      continue;
    }
    
    updated += (data?.length || 0);
  }
  
  // Count how many records still don't have default_service_id
  const { count: remainingCount } = await tenantClient
    .from('Students')
    .select('id', { count: 'exact', head: true })
    .not('default_service', 'is', null)
    .neq('default_service', '')
    .is('default_service_id', null);
  
  skipped += (remainingCount || 0);
  
  return { updated, skipped };
}

/**
 * Main migration function: Migrate legacy service strings to relational model
 * 
 * @param {Object} tenantClient - Supabase client for tenant database
 * @param {string} orgId - Organization ID
 * @returns {Promise<Object>} Migration report with statistics
 */
export async function migrateLegacyServicesToRelational(tenantClient, orgId) {
  const report = {
    success: false,
    servicesCreated: 0,
    sessionRecordsUpdated: 0,
    sessionRecordsSkipped: 0,
    studentsUpdated: 0,
    studentsSkipped: 0,
    services: [],
    errors: [],
    timestamp: new Date().toISOString()
  };
  
  try {
    // Step 1: Check if Services table exists
    const tableExists = await checkServicesTableExists(tenantClient);
    if (!tableExists) {
      report.errors.push('Services table does not exist. Please run setup-sql.js first.');
      return report;
    }
    
    // Step 2: Extract unique service names from existing data
    const uniqueServices = await extractUniqueServiceNames(tenantClient);
    
    if (uniqueServices.length === 0) {
      report.success = true;
      report.errors.push('No services found to migrate.');
      return report;
    }
    
    report.services = uniqueServices;
    
    // Step 3: Create Service records
    const serviceMap = await createServiceRecords(tenantClient, orgId, uniqueServices);
    report.servicesCreated = serviceMap.size;
    
    // Step 4: Link SessionRecords to Services
    const sessionResults = await linkSessionRecordsToServices(tenantClient, serviceMap);
    report.sessionRecordsUpdated = sessionResults.updated;
    report.sessionRecordsSkipped = sessionResults.skipped;
    
    // Step 5: Link Students to Services
    const studentResults = await linkStudentsToServices(tenantClient, serviceMap);
    report.studentsUpdated = studentResults.updated;
    report.studentsSkipped = studentResults.skipped;
    
    report.success = true;
    
  } catch (error) {
    report.errors.push(error.message);
    console.error('Migration failed:', error);
  }
  
  return report;
}

/**
 * Check if migration is needed (has unmigrated data)
 * @param {Object} tenantClient - Supabase client for tenant database
 * @returns {Promise<{needed: boolean, reason: string}>}
 */
export async function checkMigrationNeeded(tenantClient) {
  try {
    // Check if Services table exists
    const tableExists = await checkServicesTableExists(tenantClient);
    if (!tableExists) {
      return { needed: true, reason: 'services_table_missing' };
    }
    
    // Check if there are SessionRecords with service_context but no service_id
    const { count: sessionCount } = await tenantClient
      .from('SessionRecords')
      .select('id', { count: 'exact', head: true })
      .not('service_context', 'is', null)
      .neq('service_context', '')
      .is('service_id', null);
    
    if (sessionCount > 0) {
      return { needed: true, reason: 'unmigrated_session_records', count: sessionCount };
    }
    
    // Check if there are Students with default_service but no default_service_id
    const { count: studentCount } = await tenantClient
      .from('Students')
      .select('id', { count: 'exact', head: true })
      .not('default_service', 'is', null)
      .neq('default_service', '')
      .is('default_service_id', null);
    
    if (studentCount > 0) {
      return { needed: true, reason: 'unmigrated_students', count: studentCount };
    }
    
    return { needed: false, reason: 'already_migrated' };
    
  } catch (error) {
    return { needed: false, reason: 'check_failed', error: error.message };
  }
}
