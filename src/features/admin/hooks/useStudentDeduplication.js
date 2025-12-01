import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { useOrg } from '@/org/OrgContext';
import { authenticatedFetch } from '@/lib/api-client.js';

function buildQueryParams(orgId, params) {
  const searchParams = new URLSearchParams();
  if (orgId) {
    searchParams.set('org_id', orgId);
  }
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && `${value}`.trim() !== '') {
      searchParams.set(key, value);
    }
  });
  return searchParams;
}

export function useStudentNameSuggestions(nameInput) {
  const { session } = useAuth();
  const { activeOrgId } = useOrg();
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!session || !activeOrgId) {
      setSuggestions([]);
      return undefined;
    }

    const trimmed = typeof nameInput === 'string' ? nameInput.trim() : '';
    if (!trimmed || trimmed.length < 2) {
      setSuggestions([]);
      return undefined;
    }

    setLoading(true);
    setError('');

    debounceRef.current = window.setTimeout(async () => {
      try {
        const searchParams = buildQueryParams(activeOrgId, { query: trimmed });
        const results = await authenticatedFetch(`students-search?${searchParams.toString()}`, { session });
        setSuggestions(Array.isArray(results) ? results : []);
      } catch (err) {
        setSuggestions([]);
        setError(err?.message || 'חיפוש התלמידים נכשל.');
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [nameInput, session, activeOrgId]);

  return { suggestions, loading, error };
}

export function useNationalIdGuard(nationalIdInput, { excludeStudentId } = {}) {
  const { session } = useAuth();
  const { activeOrgId } = useOrg();
  const [duplicate, setDuplicate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef(null);
  const lastCheckedRef = useRef('');
  const lastDuplicateIdRef = useRef('');

  useEffect(() => {
    if (!session || !activeOrgId) {
      setDuplicate(null);
      return undefined;
    }

    const trimmed = typeof nationalIdInput === 'string' ? nationalIdInput.trim() : '';
    if (!trimmed) {
      setDuplicate(null);
      setError('');
      return undefined;
    }

    if (trimmed === lastCheckedRef.current && lastDuplicateIdRef.current) {
      return undefined;
    }

    setLoading(true);
    setError('');

    debounceRef.current = window.setTimeout(async () => {
      try {
        const searchParams = buildQueryParams(activeOrgId, {
          national_id: trimmed,
          exclude_id: excludeStudentId,
        });
        const payload = await authenticatedFetch(`students/check-id?${searchParams.toString()}`, { session });
        lastCheckedRef.current = trimmed;

        if (payload?.exists && payload.student) {
          // Extra safety check: ensure the duplicate is not the student being excluded
          if (excludeStudentId && payload.student.id === excludeStudentId) {
            setDuplicate(null);
            lastDuplicateIdRef.current = '';
          } else {
            setDuplicate(payload.student);
            lastDuplicateIdRef.current = payload.student.id || trimmed;
          }
        } else {
          setDuplicate(null);
          lastDuplicateIdRef.current = '';
        }
      } catch (err) {
        setDuplicate(null);
        lastDuplicateIdRef.current = '';
        setError(err?.message || 'אימות תעודה נכשל.');
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [nationalIdInput, session, activeOrgId, excludeStudentId]);

  return { duplicate, loading, error };
}
