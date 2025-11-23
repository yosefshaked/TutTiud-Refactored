import { authenticatedFetch } from '@/lib/api-client.js';

/**
 * Fetches the current storage configuration for an organization
 * @param {string} orgId - Organization ID
 * @param {object} options - Request options
 * @param {object} options.session - User session
 * @param {AbortSignal} options.signal - Abort signal
 * @returns {Promise<object>} Storage profile
 */
export async function fetchStorageConfiguration(orgId, { session, signal } = {}) {
  if (!orgId) {
    throw new Error('Organization ID is required');
  }

  const data = await authenticatedFetch(
    `org-settings/storage?org_id=${encodeURIComponent(orgId)}`,
    {
      method: 'GET',
      session,
      signal,
    }
  );

  return data?.storage_profile || null;
}

/**
 * Saves storage configuration for an organization
 * @param {string} orgId - Organization ID
 * @param {object} payload - Storage profile configuration
 * @param {object} options - Request options
 * @param {object} options.session - User session
 * @param {AbortSignal} options.signal - Abort signal
 * @returns {Promise<object>} Updated storage profile
 */
export async function saveStorageConfiguration(orgId, payload, { session, signal } = {}) {
  if (!orgId) {
    throw new Error('Organization ID is required');
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('Valid storage configuration payload is required');
  }

  const data = await authenticatedFetch('org-settings/storage', {
    method: 'POST',
    body: {
      org_id: orgId,
      storage_profile: payload,
    },
    session,
    signal,
  });

  if (data?.errors && Array.isArray(data.errors)) {
    throw new Error(`Validation failed: ${data.errors.join(', ')}`);
  }

  return data?.storage_profile || null;
}

/**
 * Disconnects (deletes) storage configuration for an organization
 * @param {string} orgId - Organization ID
 * @param {object} options - Request options
 * @param {object} options.session - User session
 * @param {AbortSignal} options.signal - Abort signal
 * @returns {Promise<void>}
 */
export async function deleteStorageConfiguration(orgId, { session, signal } = {}) {
  if (!orgId) {
    throw new Error('Organization ID is required');
  }

  await authenticatedFetch('org-settings/storage', {
    method: 'DELETE',
    body: {
      org_id: orgId,
    },
    session,
    signal,
  });
}
