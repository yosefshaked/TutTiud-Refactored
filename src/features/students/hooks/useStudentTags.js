import { useCallback, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { useOrg } from '@/org/OrgContext';
import { authenticatedFetch } from '@/lib/api-client';
import { normalizeMembershipRole, isAdminRole } from '@/features/students/utils/endpoints.js';

const EMPTY_ARRAY = [];

function normalizeTags(candidate) {
  if (!Array.isArray(candidate)) {
    return [];
  }

  const normalized = [];
  const seen = new Set();

  for (const entry of candidate) {
    if (!entry) {
      continue;
    }

    if (typeof entry === 'object') {
      const id = typeof entry.id === 'string' ? entry.id.trim() : '';
      const name = typeof entry.name === 'string' ? entry.name.trim() : '';
      if (id && name && !seen.has(id)) {
        seen.add(id);
        normalized.push({ id, name });
      }
      continue;
    }

    if (typeof entry === 'string') {
      const value = entry.trim();
      if (value && !seen.has(value)) {
        seen.add(value);
        normalized.push({ id: value, name: value });
      }
    }
  }

  return normalized;
}

export function useStudentTags() {
  const { session } = useAuth();
  const { activeOrg, activeOrgId } = useOrg();
  const membershipRole = normalizeMembershipRole(activeOrg?.membership?.role);
  const canManageTags = isAdminRole(membershipRole);

  const [tagOptions, setTagOptions] = useState(EMPTY_ARRAY);
  const [loadingTags, setLoadingTags] = useState(false);
  const [tagsError, setTagsError] = useState('');

  const loadTags = useCallback(async () => {
    if (!session || !activeOrgId) {
      setTagOptions([]);
      setTagsError('');
      setLoadingTags(false);
      return [];
    }

    setLoadingTags(true);
    setTagsError('');

    try {
      const searchParams = new URLSearchParams({ org_id: activeOrgId });
      const payload = await authenticatedFetch(`settings/student-tags?${searchParams.toString()}`, { session });
      const normalized = normalizeTags(payload?.tags ?? payload);
      setTagOptions(normalized);
      return normalized;
    } catch (error) {
      console.error('Failed to load student tags', error);
      setTagsError('טעינת התגיות נכשלה.');
      setTagOptions([]);
      return [];
    } finally {
      setLoadingTags(false);
    }
  }, [session, activeOrgId]);

  const createTag = useCallback(async (name) => {
    if (!session || !activeOrgId) {
      throw new Error('לא נמצאה ישות ארגון פעילה.');
    }
    if (!canManageTags) {
      const error = new Error('אין לך הרשאה להוסיף תגיות.');
      error.status = 403;
      throw error;
    }

    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!trimmed) {
      throw new Error('יש להזין שם תגית.');
    }

    const payload = await authenticatedFetch('settings/student-tags', {
      session,
      method: 'POST',
      body: {
        org_id: activeOrgId,
        name: trimmed,
      },
    });

    return payload;
  }, [session, activeOrgId, canManageTags]);

  return {
    tagOptions,
    loadingTags,
    tagsError,
    loadTags,
    createTag,
    canManageTags,
  };
}
