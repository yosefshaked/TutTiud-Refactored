import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/auth/AuthContext.jsx';
import { useOrg } from '@/org/OrgContext.jsx';
import { authenticatedFetch } from '@/lib/api-client.js';
import { fetchSettings } from '@/features/settings/api/settings.js';

function normalizeString(value) {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  return String(value).trim();
}

function normalizeDisplayLabels(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  return raw;
}

function normalizeImportantFields(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);
}

function formatAnswerEntries(currentAnswers, labelMap, importantFields, { showAll = false } = {}) {
  if (!currentAnswers || typeof currentAnswers !== 'object') {
    return [];
  }

  const excludedKeys = new Set(['intake_html_source', 'intake_date', 'response_id']);
  const importantSet = new Set(importantFields);

  return Object.entries(currentAnswers)
    .filter(([key]) => !excludedKeys.has(key))
    .filter(([key]) => (showAll ? true : importantSet.has(key)))
    .map(([key, value]) => {
      if (value === null || value === undefined) {
        return null;
      }
      if (typeof value === 'object' && !Array.isArray(value)) {
        return null;
      }
      const textValue = Array.isArray(value)
        ? value.filter((entry) => entry !== null && entry !== undefined).join(', ')
        : String(value);
      const trimmedValue = normalizeString(textValue);
      if (!trimmedValue) {
        return null;
      }
      return {
        label: labelMap[key] || key,
        value: trimmedValue,
      };
    })
    .filter(Boolean);
}

export default function IntakeReviewQueue() {
  const { session } = useAuth();
  const { activeOrgId, activeOrgHasConnection, tenantClientReady } = useOrg();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingStudents, setPendingStudents] = useState([]);
  const [displayLabels, setDisplayLabels] = useState({});
  const [importantFields, setImportantFields] = useState([]);
  const [approvingIds, setApprovingIds] = useState(() => new Set());
  const [expandedIds, setExpandedIds] = useState(() => new Set());

  useEffect(() => {
    let cancelled = false;

    const loadQueue = async () => {
      if (!session || !activeOrgId || !activeOrgHasConnection || !tenantClientReady) {
        if (!cancelled) {
          setPendingStudents([]);
          setError('');
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);
      setError('');

      try {
        const [studentsResponse, settingsResponse] = await Promise.all([
          authenticatedFetch('students-list', {
            session,
            params: { org_id: activeOrgId, status: 'all' },
          }),
          fetchSettings({ session, orgId: activeOrgId }),
        ]);

        if (cancelled) {
          return;
        }

        const roster = Array.isArray(studentsResponse) ? studentsResponse : [];
        const pending = roster.filter((student) => student?.needs_intake_approval === true);
        setPendingStudents(pending);
        setDisplayLabels(normalizeDisplayLabels(settingsResponse?.intake_display_labels));
        setImportantFields(normalizeImportantFields(settingsResponse?.intake_important_fields));
      } catch (loadError) {
        console.error('Failed to load intake queue', loadError);
        if (!cancelled) {
          setError('טעינת תור קליטה נכשלה. נסו שוב.');
          setPendingStudents([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadQueue();

    return () => {
      cancelled = true;
    };
  }, [session, activeOrgId, activeOrgHasConnection, tenantClientReady]);

  const labelMap = useMemo(() => displayLabels, [displayLabels]);

  const handleApprove = async (studentId) => {
    if (!session || !activeOrgId) {
      return;
    }

    setApprovingIds((prev) => new Set(prev).add(studentId));
    setError('');

    try {
      await authenticatedFetch('intake/approve', {
        method: 'POST',
        session,
        body: {
          org_id: activeOrgId,
          student_id: studentId,
        },
      });
      setPendingStudents((prev) => prev.filter((student) => student.id !== studentId));
    } catch (approveError) {
      console.error('Failed to approve intake', approveError);
      setError('אישור קליטה נכשל. נסו שוב.');
    } finally {
      setApprovingIds((prev) => {
        const next = new Set(prev);
        next.delete(studentId);
        return next;
      });
    }
  };

  const toggleExpanded = (studentId) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }
      return next;
    });
  };

  if (!isLoading && !error && pendingStudents.length === 0) {
    return null;
  }

  return (
    <Alert variant="destructive" className="bg-red-50 border-red-200" dir="rtl">
      <AlertTriangle className="h-5 w-5" />
      <div className="space-y-4">
        <AlertTitle>תור קליטת תלמידים ממתין לאישור</AlertTitle>
        <AlertDescription>
          {isLoading ? (
            <p>טוען קליטות ממתינות...</p>
          ) : (
            <p>נמצאו {pendingStudents.length} קליטות ממתינות לבדיקה.</p>
          )}
        </AlertDescription>

        {error ? (
          <div className="rounded-md border border-red-200 bg-white p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="space-y-4">
          {pendingStudents.map((student) => {
            const isExpanded = expandedIds.has(student.id);
            const answers = formatAnswerEntries(
              student?.intake_responses?.current,
              labelMap,
              importantFields,
              { showAll: isExpanded }
            );
            const isApproving = approvingIds.has(student.id);

            return (
              <div key={student.id} className="rounded-xl border border-red-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-2">
                    <Link
                      to={`/students/${student.id}`}
                      className="text-base font-semibold text-slate-900 hover:text-primary"
                    >
                      {student.name}
                    </Link>
                    <dl className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                      <div>
                        <dt className="font-medium">מספר זהות</dt>
                        <dd>{student.national_id || 'לא צוין'}</dd>
                      </div>
                      <div>
                        <dt className="font-medium">שם איש קשר</dt>
                        <dd>{student.contact_name || 'לא צוין'}</dd>
                      </div>
                      <div>
                        <dt className="font-medium">טלפון איש קשר</dt>
                        <dd>{student.contact_phone || 'לא צוין'}</dd>
                      </div>
                    </dl>
                  </div>
                  <Button
                    type="button"
                    onClick={() => handleApprove(student.id)}
                    disabled={isApproving}
                  >
                    {isApproving ? 'מאשר...' : 'אישור קליטה'}
                  </Button>
                </div>

                <div className="mt-4 rounded-lg bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-800">תשובות מהטופס</p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => toggleExpanded(student.id)}
                    >
                      {isExpanded ? 'הצג תצוגה מצומצמת' : 'הצג את כל הקליטה'}
                    </Button>
                  </div>
                  {answers.length ? (
                    <ul className="mt-2 space-y-1 text-sm text-slate-700">
                      {answers.map((entry) => (
                        <li key={`${student.id}-${entry.label}`} className="flex flex-wrap gap-2">
                          <span className="font-medium">{entry.label}:</span>
                          <span>{entry.value}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-slate-500">
                      {isExpanded ? 'אין תשובות זמינות להצגה.' : 'לא הוגדרו שדות חשובים להצגה.'}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Alert>
  );
}
