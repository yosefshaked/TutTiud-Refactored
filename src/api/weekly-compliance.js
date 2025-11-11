import { authenticatedFetch } from '@/lib/api-client.js'

function buildWeeklyCompliancePath({ orgId, weekStart } = {}) {
  const params = new URLSearchParams()
  if (orgId) {
    params.set('org_id', orgId)
  }
  if (weekStart) {
    params.set('week_start', weekStart)
  }

  const query = params.toString()
  return query ? `weekly-compliance?${query}` : 'weekly-compliance'
}

async function requestWeeklyCompliance({ orgId, weekStart, signal } = {}) {
  const path = buildWeeklyCompliancePath({ orgId, weekStart })
  return authenticatedFetch(path, { signal })
}

export async function fetchWeeklyComplianceView({ orgId, weekStart, signal } = {}) {
  return requestWeeklyCompliance({ orgId, weekStart, signal })
}

export async function fetchInstructorLegend({ orgId, signal } = {}) {
  const response = await requestWeeklyCompliance({ orgId, signal })
  if (response && Array.isArray(response.legend)) {
    return response.legend
  }
  return []
}
