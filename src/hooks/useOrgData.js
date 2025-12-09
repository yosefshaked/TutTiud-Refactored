import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/auth/AuthContext.jsx';
import { useOrg } from '@/org/OrgContext.jsx';
import { authenticatedFetch } from '@/lib/api-client.js';

function resolveOrgAndSession({ orgId: orgIdOverride, session: sessionOverride }, contextOrgId, contextSession) {
  const orgId = orgIdOverride ?? contextOrgId ?? null;
  const session = sessionOverride ?? contextSession ?? null;
  return { orgId, session };
}

function shouldInclude(value) {
  return value !== undefined && value !== null && `${value}`.trim() !== '';
}

function buildSearchParams(baseParams = {}, orgId) {
  const searchParams = new URLSearchParams();
  if (shouldInclude(orgId)) {
    searchParams.set('org_id', orgId);
  }
  Object.entries(baseParams).forEach(([key, value]) => {
    if (shouldInclude(value)) {
      searchParams.set(key, value);
    }
  });
  return searchParams;
}

function useOrgDataResource({
  resource,
  path = '',
  enabled = true,
  orgId: orgIdOverride,
  session: sessionOverride,
  resetOnDisable = true,
  params = {},
  mapResponse = (payload) => payload,
}) {
  const { session: contextSession } = useAuth();
  const { activeOrgId } = useOrg();

  const { orgId, session } = resolveOrgAndSession({ orgId: orgIdOverride, session: sessionOverride }, activeOrgId, contextSession);

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const searchParams = useMemo(() => buildSearchParams(params, orgId), [params, orgId]);

  const fetchResource = useCallback(async ({ updateState = true } = {}) => {
    const controller = new AbortController();
    const effectiveEnabled = enabled && shouldInclude(orgId);

    if (!effectiveEnabled) {
      if (updateState && resetOnDisable) {
        setData([]);
      }
      return { result: [], controller };
    }

    if (updateState) {
      setLoading(true);
      setError('');
    }

    try {
      const payload = await authenticatedFetch(`${path}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`, {
        session,
        signal: controller.signal,
      });
      const mapped = mapResponse(payload);
      const normalized = Array.isArray(mapped) ? mapped : [];
      if (updateState && !controller.signal.aborted) {
        setData(normalized);
      }
      return { result: normalized, controller };
    } catch (err) {
      if (err?.name === 'AbortError') {
        return { result: [], controller };
      }
      console.error(`Failed to load ${resource}`, err);
      if (updateState && !controller.signal.aborted) {
        setError(err?.message || '');
        setData([]);
      }
      return { result: [], controller };
    } finally {
      if (updateState && !controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [enabled, orgId, resetOnDisable, searchParams, session, mapResponse, resource, path]);

  useEffect(() => {
    const { controller } = fetchResource();
    return () => {
      if (controller) {
        controller.abort();
      }
    };
  }, [fetchResource]);

  return {
    data,
    loading,
    error,
    refetch: fetchResource,
  };
}

export function useInstructors(options = {}) {
  const { includeInactive = false, enabled = true, orgId, session, resetOnDisable = true } = options;
  const params = useMemo(() => ({ include_inactive: includeInactive ? 'true' : undefined }), [includeInactive]);

  const { data, loading, error, refetch } = useOrgDataResource({
    resource: 'instructors',
    path: 'instructors',
    enabled,
    orgId,
    session,
    resetOnDisable,
    params,
  });

  return {
    instructors: data,
    loadingInstructors: loading,
    instructorsError: error,
    refetchInstructors: refetch,
  };
}

export function useServices(options = {}) {
  const { enabled = true, orgId, session, resetOnDisable = true } = options;
  const mapResponse = (payload) => payload?.settings?.available_services;

  const { data, loading, error, refetch } = useOrgDataResource({
    resource: 'services',
    path: 'settings',
    enabled,
    orgId,
    session,
    resetOnDisable,
    params: { keys: 'available_services' },
    mapResponse,
  });

  return {
    services: data,
    loadingServices: loading,
    servicesError: error,
    refetchServices: refetch,
  };
}

export function useStudents(options = {}) {
  const {
    status = 'active',
    enabled = true,
    orgId,
    session,
    resetOnDisable = true,
    path = 'students',
    extraParams = {},
  } = options;

  const params = useMemo(() => ({ status, ...extraParams }), [status, extraParams]);

  const { data, loading, error, refetch } = useOrgDataResource({
    resource: 'students',
    path,
    enabled,
    orgId,
    session,
    resetOnDisable,
    params,
  });

  return {
    students: data,
    loadingStudents: loading,
    studentsError: error,
    refetchStudents: refetch,
  };
}
