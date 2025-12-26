import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/auth/AuthContext.jsx';
import { useOrg } from '@/org/OrgContext.jsx';
import { authenticatedFetch } from '@/lib/api-client.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fetchSettings } from '@/features/settings/api/settings.js';
import { useInstructors } from '@/hooks/useOrgData.js';
import { isAdminRole, normalizeMembershipRole } from '@/features/students/utils/endpoints.js';

const APPROVAL_AGREEMENT_TEXT = 'אני מאשר/ת שקראתי את האינטייק של התלמיד/ה וביצעתי שיחת קליטה עם האפוטרופוס.';

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

  const allEntries = Object.entries(currentAnswers)
    .filter(([key]) => !excludedKeys.has(key))
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
        key,
        label: labelMap[key] || key,
        value: trimmedValue,
      };
    })
    .filter(Boolean);

  if (!importantFields.length) {
    return showAll ? allEntries : [];
  }

  const orderedImportant = importantFields
    .map((fieldKey) => allEntries.find((entry) => entry.key === fieldKey))
    .filter(Boolean);

  if (!showAll) {
    return orderedImportant;
  }

  const remaining = allEntries.filter((entry) => !importantSet.has(entry.key));
  return [...orderedImportant, ...remaining];
}

export default function IntakeReviewQueue() {
  const { session } = useAuth();
  const { activeOrg, activeOrgId, activeOrgHasConnection, tenantClientReady } = useOrg();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingStudents, setPendingStudents] = useState([]);
  const [displayLabels, setDisplayLabels] = useState({});
  const [importantFields, setImportantFields] = useState([]);
  const [approvingIds, setApprovingIds] = useState(() => new Set());
  const [openIds, setOpenIds] = useState(() => new Set());
  const [showAllIds, setShowAllIds] = useState(() => new Set());
  const [expandedAnswers, setExpandedAnswers] = useState(() => new Set());
  const [confirmingStudentId, setConfirmingStudentId] = useState('');
  const [agreementChecked, setAgreementChecked] = useState(false);
  const [instructorFilterId, setInstructorFilterId] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [retryToken, setRetryToken] = useState(0);

  const membershipRole = normalizeMembershipRole(activeOrg?.membership?.role);
  const isAdmin = isAdminRole(membershipRole);
  const { instructors, loadingInstructors } = useInstructors({
    enabled: Boolean(session && activeOrgId && activeOrgHasConnection && tenantClientReady && isAdmin),
    orgId: activeOrgId,
    session,
    includeInactive: true,
  });

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
  }, [session, activeOrgId, activeOrgHasConnection, tenantClientReady, retryToken]);

  const labelMap = useMemo(() => displayLabels, [displayLabels]);

  const summaryCounts = useMemo(() => {
    return pendingStudents.reduce(
      (accumulator, student) => {
        if (student?.assigned_instructor_id) {
          accumulator.existing += 1;
        } else {
          accumulator.new += 1;
        }
        return accumulator;
      },
      { new: 0, existing: 0 }
    );
  }, [pendingStudents]);

  const handleRetry = () => {
    setRetryToken((value) => value + 1);
  };

  const handleApprove = async (studentId, agreement) => {
    if (!session || !activeOrgId) {
      return;
    }
    if (!agreement?.acknowledged) {
      setError('יש לאשר את הצהרת ההסכמה לפני האישור.');
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
          agreement,
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

  const toggleSection = (studentId, isOpen) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (isOpen) {
        next.add(studentId);
      } else {
        next.delete(studentId);
      }
      return next;
    });
  };

  const toggleShowAll = (studentId) => {
    setShowAllIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }
      return next;
    });
  };

  const toggleAnswer = (answerKey) => {
    setExpandedAnswers((prev) => {
      const next = new Set(prev);
      if (next.has(answerKey)) {
        next.delete(answerKey);
      } else {
        next.add(answerKey);
      }
      return next;
    });
  };

  const handleAnswerKeyDown = (event, answerKey, canExpand) => {
    if (!canExpand) {
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleAnswer(answerKey);
    }
  };

  const openConfirmDialog = (studentId) => {
    setConfirmingStudentId(studentId);
    setAgreementChecked(false);
  };

  const closeConfirmDialog = (open) => {
    if (!open) {
      setConfirmingStudentId('');
      setAgreementChecked(false);
    }
  };

  const confirmStudent = pendingStudents.find((student) => student.id === confirmingStudentId);
  const isConfirmingApproval = confirmingStudentId ? approvingIds.has(confirmingStudentId) : false;

  const handleConfirmApprove = async () => {
    if (!confirmingStudentId || !agreementChecked) {
      return;
    }
    await handleApprove(confirmingStudentId, {
      acknowledged: true,
      acknowledged_at: new Date().toISOString(),
      statement: APPROVAL_AGREEMENT_TEXT,
    });
    setConfirmingStudentId('');
    setAgreementChecked(false);
  };

  const instructorMap = useMemo(() => {
    return new Map((instructors || []).filter((entry) => entry?.id).map((entry) => [entry.id, entry]));
  }, [instructors]);

  const filteredStudents = useMemo(() => {
    if (!isAdmin || !instructorFilterId) {
      return pendingStudents;
    }
    if (instructorFilterId === 'unassigned') {
      return pendingStudents.filter((student) => !student?.assigned_instructor_id);
    }
    return pendingStudents.filter((student) => student?.assigned_instructor_id === instructorFilterId);
  }, [pendingStudents, instructorFilterId, isAdmin]);

  const alertVariant = pendingStudents.length > 0 || error ? 'destructive' : 'default';
  const toggleLabel = isCollapsed ? 'פתח תור קליטה' : 'סגור תור קליטה';
  const summaryStatus = (() => {
    if (isLoading) {
      return 'טוען קליטות ממתינות...';
    }
    if (error) {
      return 'אירעה שגיאה בטעינת תור הקליטה.';
    }
    if (pendingStudents.length === 0) {
      return 'אין קליטות שממתינות לאישור.';
    }
    return `נמצאו ${pendingStudents.length} קליטות ממתינות לבדיקה.`;
  })();

  return (
    <Alert
      variant={alertVariant}
      className={alertVariant === 'destructive' ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}
      dir="rtl"
    >
      <AlertTriangle className="h-5 w-5" />
      <div className="space-y-4">
        <AlertTitle>תור קליטת תלמידים ממתין לאישור</AlertTitle>
        <AlertDescription className="space-y-3">
          <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <p className="font-semibold text-slate-900">{summaryStatus}</p>
                <div className="flex flex-wrap gap-2">
                  <div className="flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1">
                    <span className="text-xs font-medium text-slate-500">חדשים</span>
                    <span className="text-sm font-semibold text-slate-900" aria-live="polite">
                      {isLoading ? '...' : summaryCounts.new}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1">
                    <span className="text-xs font-medium text-slate-500">קיימים</span>
                    <span className="text-sm font-semibold text-slate-900" aria-live="polite">
                      {isLoading ? '...' : summaryCounts.existing}
                    </span>
                  </div>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCollapsed((value) => !value)}
                aria-expanded={!isCollapsed}
                aria-controls="intake-review-queue-details"
              >
                {toggleLabel}
              </Button>
            </div>
            {error ? (
              <div className="flex flex-col gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between">
                <span>{error}</span>
                <Button type="button" size="sm" variant="outline" onClick={handleRetry}>
                  נסו שוב
                </Button>
              </div>
            ) : null}
          </div>
        </AlertDescription>

        {!isCollapsed ? (
          <div id="intake-review-queue-details" className="space-y-4">
            {isAdmin ? (
              <div className="flex flex-col gap-2 rounded-lg border border-red-100 bg-white p-3 text-sm text-slate-700 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="font-semibold text-slate-900">סינון לפי מדריך</p>
                  <p className="text-xs text-slate-500">בחרו מדריך, לא משויך, או כל הקליטות.</p>
                </div>
                <div className="w-full sm:max-w-xs">
                  <label htmlFor="intake-instructor-filter" className="sr-only">סינון מדריך</label>
                  <Select
                    value={instructorFilterId || 'all'}
                    onValueChange={(value) => setInstructorFilterId(value === 'all' ? '' : value)}
                    disabled={loadingInstructors}
                  >
                    <SelectTrigger id="intake-instructor-filter">
                      <SelectValue placeholder={loadingInstructors ? 'טוען מדריכים...' : 'כל המדריכים'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">כל המדריכים</SelectItem>
                      <SelectItem value="unassigned">לא משויך</SelectItem>
                      {(instructors || []).map((instructor) => (
                        instructor?.id ? (
                          <SelectItem key={instructor.id} value={instructor.id}>
                            {instructor.name || instructor.email || 'מדריך ללא שם'}
                          </SelectItem>
                        ) : null
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : null}

            <div className="space-y-4">
              {filteredStudents.length === 0 && !isLoading ? (
                <div className="rounded-md border border-red-100 bg-white p-3 text-sm text-slate-600">
                  אין קליטות תואמות למסנן שנבחר.
                </div>
              ) : null}
              {filteredStudents.map((student) => {
                const isSectionOpen = openIds.has(student.id);
                const showAll = showAllIds.has(student.id);
                const answers = formatAnswerEntries(
                  student?.intake_responses?.current,
                  labelMap,
                  importantFields,
                  { showAll }
                );
                const isApproving = approvingIds.has(student.id);
                const instructor = isAdmin ? instructorMap.get(student?.assigned_instructor_id) : null;
                const instructorName = instructor?.name || instructor?.email || (student?.assigned_instructor_id ? 'מדריך לא זמין' : 'לא הוקצה מדריך');

                return (
                  <div key={student.id} className="rounded-xl border border-red-200 bg-white p-4 shadow-sm">
                    <details
                      className="group"
                      open={isSectionOpen}
                      onToggle={(event) => toggleSection(student.id, event.currentTarget.open)}
                    >
                      <summary className="cursor-pointer list-none space-y-3 focus-visible:outline-none">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="space-y-3">
                            <p className="text-base font-semibold text-slate-900">{student.name}</p>
                            <dl className="flex flex-col gap-3 text-sm text-slate-700 sm:flex-row sm:flex-wrap sm:items-center">
                              <div className="flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1">
                                <dt className="font-medium text-slate-500">מספר זהות</dt>
                                <dd className="font-semibold text-slate-800">{student.national_id || 'לא צוין'}</dd>
                              </div>
                              <div className="flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1">
                                <dt className="font-medium text-slate-500">שם איש קשר</dt>
                                <dd className="font-semibold text-slate-800">{student.contact_name || 'לא צוין'}</dd>
                              </div>
                              <div className="flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1">
                                <dt className="font-medium text-slate-500">טלפון איש קשר</dt>
                                <dd className="font-semibold text-slate-800">{student.contact_phone || 'לא צוין'}</dd>
                              </div>
                              {isAdmin ? (
                                <div className="flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-blue-800">
                                  <dt className="font-medium text-blue-600">מדריך</dt>
                                  <dd className="font-semibold">{instructorName}</dd>
                                </div>
                              ) : null}
                            </dl>
                          </div>
                          <span className="text-xs font-medium text-slate-500">
                            {isSectionOpen ? 'לחצו לסגירה' : 'לחצו לפתיחה'}
                          </span>
                        </div>
                      </summary>

                      <div className="mt-4 space-y-4 border-t border-slate-200 pt-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="space-y-2">
                            <Link
                              to={`/students/${student.id}`}
                              className="text-sm font-semibold text-slate-900 hover:text-primary"
                            >
                              מעבר לכרטיס תלמיד
                            </Link>
                          </div>
                          <Button
                            type="button"
                            onClick={() => openConfirmDialog(student.id)}
                            disabled={isApproving}
                          >
                            {isApproving ? 'מאשר...' : 'אישור קליטה'}
                          </Button>
                        </div>

                        <div className="rounded-lg bg-slate-50 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-medium text-slate-800">תשובות מהטופס</p>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => toggleShowAll(student.id)}
                            >
                              {showAll ? 'הצג תצוגה מצומצמת' : 'הצג את כל הקליטה'}
                            </Button>
                          </div>
                          {answers.length ? (
                            <div className="mt-3 grid gap-3 text-sm text-slate-700 md:grid-cols-2">
                              {answers.map((entry, index) => {
                                const answerKey = `${student.id}-${entry.label}-${index}`;
                                const isLongAnswer = entry.value.length > 120 || entry.value.includes('\n');
                                const isExpandedAnswer = expandedAnswers.has(answerKey);
                                return (
                                  <div key={answerKey} className="rounded-md border border-slate-200 bg-white p-3">
                                    <p className="text-xs font-semibold text-slate-500">{entry.label}</p>
                                    <p
                                      className={`mt-1 text-sm text-slate-700 ${
                                        isLongAnswer ? 'cursor-pointer' : ''
                                      } ${isExpandedAnswer ? 'whitespace-pre-wrap' : 'line-clamp-2'}`}
                                      onClick={isLongAnswer ? () => toggleAnswer(answerKey) : undefined}
                                      onKeyDown={(event) => handleAnswerKeyDown(event, answerKey, isLongAnswer)}
                                      role={isLongAnswer ? 'button' : undefined}
                                      tabIndex={isLongAnswer ? 0 : undefined}
                                    >
                                      {entry.value}
                                    </p>
                                    {isLongAnswer && !isExpandedAnswer ? (
                                      <p className="mt-1 text-xs text-slate-400">לחצו להצגה מלאה</p>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="mt-2 text-sm text-slate-500">
                              {showAll ? 'אין תשובות זמינות להצגה.' : 'לא הוגדרו שדות חשובים להצגה.'}
                            </p>
                          )}
                        </div>
                      </div>
                    </details>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      <AlertDialog open={Boolean(confirmingStudentId)} onOpenChange={closeConfirmDialog}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>אישור קליטה</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmStudent?.name
                ? `לפני אישור קליטה עבור ${confirmStudent.name}, יש לאשר את הצהרת ההסכמה.`
                : 'לפני אישור קליטה יש לאשר את הצהרת ההסכמה.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
            <Checkbox
              id="intake-approval-agreement"
              checked={agreementChecked}
              onCheckedChange={(value) => setAgreementChecked(value === true)}
            />
            <Label htmlFor="intake-approval-agreement" className="text-sm text-slate-700">
              {APPROVAL_AGREEMENT_TEXT}
            </Label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>בטל</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmApprove}
              disabled={!agreementChecked || isConfirmingApproval}
            >
              {isConfirmingApproval ? 'מאשר...' : 'מאשר/ת קליטה'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Alert>
  );
}
