import { authenticatedFetch } from '@/lib/api-client.js';

export async function fetchWeeklyComplianceView({ orgId, weekStart, signal } = {}) {
  const params = new URLSearchParams();
  if (orgId) {
    params.set('org_id', orgId);
  }
  if (weekStart) {
    params.set('week_start', weekStart);
  }

  const query = params.toString();
  const path = query ? `weekly-compliance?${query}` : 'weekly-compliance';

  return authenticatedFetch(path, { signal });
}
