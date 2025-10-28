import { useMemo } from 'react';
import { useOrg } from '@/org/OrgContext.jsx';

/**
 * Hook to determine user's role for role-based features
 * @returns {{ isAdmin: boolean, isOwner: boolean, isMember: boolean, role: string }}
 */
export function useUserRole() {
  const { activeOrgMembership } = useOrg();

  return useMemo(() => {
    const role = activeOrgMembership?.role || 'member';
    const normalizedRole = String(role).trim().toLowerCase();

    return {
      role: normalizedRole,
      isOwner: normalizedRole === 'owner',
      isAdmin: normalizedRole === 'admin' || normalizedRole === 'owner',
      isMember: normalizedRole === 'member' || normalizedRole === 'instructor',
    };
  }, [activeOrgMembership]);
}
