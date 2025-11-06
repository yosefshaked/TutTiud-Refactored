import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Loader2, ArrowRight, ChevronDown, ChevronUp, Pencil, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useSupabase } from '@/context/SupabaseContext.jsx';
import { useOrg } from '@/org/OrgContext.jsx';
import { authenticatedFetch } from '@/lib/api-client.js';
import { describeSchedule, formatDefaultTime } from '@/features/students/utils/schedule.js';
import { ensureSessionFormFallback, parseSessionFormConfig } from '@/features/sessions/utils/form-config.js';
import { buildStudentsEndpoint, normalizeMembershipRole, isAdminRole } from '@/features/students/utils/endpoints.js';
import { useSessionModal } from '@/features/sessions/context/SessionModalContext.jsx';
import { getQuestionsForVersion } from '@/features/sessions/utils/version-helpers.js';
import { format, parseISO } from 'date-fns';
import { he } from 'date-fns/locale';
import { toast } from 'sonner';
import EditStudentModal from '@/features/admin/components/EditStudentModal.jsx';
import { normalizeTagIdsForWrite, normalizeTagCatalog, buildTagDisplayList } from '@/features/students/utils/tags.js';
import { exportStudentPdf, downloadPdfBlob } from '@/api/students-export.js';

const REQUEST_STATE = Object.freeze({
  idle: 'idle',
  loading: 'loading',
  error: 'error',
});

function buildSessionHistoryEndpoint(studentId, orgId) {
  const searchParams = new URLSearchParams({ student_id: studentId });
  if (orgId) {
    searchParams.set('org_id', orgId);
  }
  return `session-records?${searchParams.toString()}`;
}

function parseSessionContent(raw) {
  if (raw === null || raw === undefined) {
    return {};
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) {
      return {};
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    } catch {
      return { notes: trimmed };
    }
    return { notes: trimmed };
  }
  if (typeof raw === 'object') {
    return raw;
  }
  return {};
}

function formatSessionDate(value) {
  if (!value) {
    return '';
  }
  try {
    const parsed = parseISO(value);
    if (!Number.isNaN(parsed.getTime())) {
      return format(parsed, 'dd/MM/yyyy', { locale: he });
    }
  } catch {
    // ignore parsing failures
  }
  return value;
}

function buildAnswerList(content, questions) {
  const answers = parseSessionContent(content);
  const entries = [];
  const seenKeys = new Set();

  if (answers && typeof answers === 'object' && !Array.isArray(answers)) {
    for (const question of questions) {
      const key = question.key;
      const label = question.label;
      let value = answers[key];
      if (value === undefined && typeof answers[label] !== 'undefined') {
        value = answers[label];
      }
      if (value === undefined || value === null || value === '') {
        continue;
      }
      entries.push({ label, value: String(value) });
      seenKeys.add(key);
      seenKeys.add(label);
    }

    for (const [rawKey, rawValue] of Object.entries(answers)) {
      if (rawValue === undefined || rawValue === null || rawValue === '') {
        continue;
      }
      const normalizedKey = String(rawKey);
      if (seenKeys.has(normalizedKey)) {
        continue;
      }
      entries.push({ label: normalizedKey, value: String(rawValue) });
    }
  } else if (typeof answers === 'string' && answers.trim()) {
    entries.push({ label: 'תוכן המפגש', value: answers.trim() });
  }

  return entries;
}

export default function StudentDetailPage() {
  const { id: studentIdParam } = useParams();
  const studentId = typeof studentIdParam === 'string' ? studentIdParam : '';
  const { loading: supabaseLoading, session } = useSupabase();
  const { activeOrg, activeOrgHasConnection, tenantClientReady, activeOrgConnection } = useOrg();
  const { openSessionModal } = useSessionModal();

  const [studentState, setStudentState] = useState(REQUEST_STATE.idle);
  const [studentError, setStudentError] = useState('');
  const [student, setStudent] = useState(null);

  const [sessionState, setSessionState] = useState(REQUEST_STATE.idle);
  const [sessionError, setSessionError] = useState('');
  const [sessions, setSessions] = useState([]);
  const [expandedById, setExpandedById] = useState({});

  const [questionsState, setQuestionsState] = useState(REQUEST_STATE.idle);
  const [questionsError, setQuestionsError] = useState('');
  const [questions, setQuestions] = useState([]);
  const [formConfig, setFormConfig] = useState(null); // Store full config for version lookup

  const [tagCatalog, setTagCatalog] = useState([]);
  const [tagsState, setTagsState] = useState(REQUEST_STATE.idle);
  const [tagsError, setTagsError] = useState('');

  const [instructors, setInstructors] = useState([]);

  // Edit student modal state
  const [studentForEdit, setStudentForEdit] = useState(null);
  const [isUpdatingStudent, setIsUpdatingStudent] = useState(false);
  const [updateError, setUpdateError] = useState('');

  // Export state
  const [isExporting, setIsExporting] = useState(false);

  const activeOrgId = activeOrg?.id || null;
  const membershipRole = normalizeMembershipRole(activeOrg?.membership?.role);
  const permissions = activeOrgConnection?.permissions ?? {};

  const canFetch = useMemo(() => {
    return (
      Boolean(studentId) &&
      Boolean(activeOrgId) &&
      activeOrgHasConnection &&
      tenantClientReady &&
      !supabaseLoading
    );
  }, [studentId, activeOrgId, activeOrgHasConnection, tenantClientReady, supabaseLoading]);

  const loadStudent = useCallback(async () => {
    if (!canFetch) {
      return;
    }

    setStudentState(REQUEST_STATE.loading);
    setStudentError('');

    try {
      const endpoint = buildStudentsEndpoint(activeOrgId, membershipRole);
      const payload = await authenticatedFetch(endpoint);
      const roster = Array.isArray(payload) ? payload : [];
      const match = roster.find((entry) => entry?.id === studentId) || null;

      if (!match) {
        setStudent(null);
        setStudentState(REQUEST_STATE.error);
        setStudentError('התלמיד לא נמצא במערכת.');
        return;
      }

      setStudent(match);
      setStudentState(REQUEST_STATE.idle);
    } catch (error) {
      console.error('Failed to load student detail', error);
      setStudent(null);
      setStudentState(REQUEST_STATE.error);
      setStudentError(error?.message || 'טעינת פרטי התלמיד נכשלה.');
    }
  }, [canFetch, activeOrgId, membershipRole, studentId]);

  const loadQuestions = useCallback(async () => {
    if (!canFetch) {
      return;
    }

    setQuestionsState(REQUEST_STATE.loading);
    setQuestionsError('');

    try {
      const searchParams = new URLSearchParams({ keys: 'session_form_config' });
      if (activeOrgId) {
        searchParams.set('org_id', activeOrgId);
      }
      const payload = await authenticatedFetch(`settings?${searchParams.toString()}`);
      const settingsValue = payload?.settings?.session_form_config ?? null;
      
      // Store full config for version-aware lookups
      setFormConfig(settingsValue);
      
      // Parse current questions for display
      const normalized = ensureSessionFormFallback(parseSessionFormConfig(settingsValue));
      setQuestions(normalized);
      setQuestionsState(REQUEST_STATE.idle);
    } catch (error) {
      console.error('Failed to load session form configuration', error);
      setFormConfig(null);
      setQuestions(ensureSessionFormFallback([]));
      setQuestionsState(REQUEST_STATE.error);
      setQuestionsError(error?.message || 'טעינת תצורת טופס המפגש נכשלה.');
    }
  }, [canFetch, activeOrgId]);

  const loadSessions = useCallback(async () => {
    if (!canFetch) {
      return;
    }

    setSessionState(REQUEST_STATE.loading);
    setSessionError('');

    try {
      const endpoint = buildSessionHistoryEndpoint(studentId, activeOrgId);
      const payload = await authenticatedFetch(endpoint);
      const rows = Array.isArray(payload) ? payload : [];
      const normalized = rows
        .map((record) => ({
          ...record,
          content: parseSessionContent(record?.content),
        }))
        .sort((a, b) => {
          if (!a?.date || !b?.date) {
            return 0;
          }
          return a.date < b.date ? 1 : -1;
        });
      setSessions(normalized);
      // Default collapsed: only show headers until the user expands
      const collapsed = {};
      normalized.forEach((r) => { collapsed[r.id || r.date] = false; });
      setExpandedById(collapsed);
      setSessionState(REQUEST_STATE.idle);
    } catch (error) {
      console.error('Failed to load session history', error);
      if (error?.status === 404) {
        setSessions([]);
        setSessionState(REQUEST_STATE.idle);
        return;
      }
      setSessions([]);
      setSessionState(REQUEST_STATE.error);
      setSessionError(error?.message || 'טעינת היסטוריית המפגשים נכשלה.');
    }
  }, [canFetch, studentId, activeOrgId]);

  const loadInstructors = useCallback(async () => {
    if (!canFetch) {
      return;
    }

    try {
      const searchParams = new URLSearchParams({ org_id: activeOrgId });
      const payload = await authenticatedFetch(`instructors?${searchParams.toString()}`);
      setInstructors(Array.isArray(payload) ? payload : []);
    } catch (error) {
      console.error('Failed to load instructors', error);
      setInstructors([]);
    }
  }, [canFetch, activeOrgId]);

  useEffect(() => {
    if (canFetch) {
      void loadStudent();
      void loadQuestions();
      void loadSessions();
      void loadInstructors();
    } else {
      setStudentState(REQUEST_STATE.idle);
      setStudentError('');
      setStudent(null);
      setQuestionsState(REQUEST_STATE.idle);
      setQuestionsError('');
      setQuestions([]);
      setSessionState(REQUEST_STATE.idle);
      setSessionError('');
      setSessions([]);
      setInstructors([]);
    }
  }, [canFetch, loadStudent, loadQuestions, loadSessions, loadInstructors]);

  const hasStudentTags = Array.isArray(student?.tags) && student.tags.length > 0;
  const studentIdentifier = student?.id || '';

  useEffect(() => {
    if (!hasStudentTags) {
      setTagCatalog([]);
      setTagsState(REQUEST_STATE.idle);
      setTagsError('');
      return;
    }

    let isMounted = true;
    async function loadTagCatalog() {
      setTagsState(REQUEST_STATE.loading);
      setTagsError('');
      try {
        const searchParams = new URLSearchParams();
        if (activeOrgId) {
          searchParams.set('org_id', activeOrgId);
        }
        const endpoint = searchParams.toString()
          ? `settings/student-tags?${searchParams.toString()}`
          : 'settings/student-tags';
        const payload = await authenticatedFetch(endpoint);
        if (!isMounted) {
          return;
        }
        const normalized = normalizeTagCatalog(payload?.tags ?? payload);
        setTagCatalog(normalized);
        setTagsState(REQUEST_STATE.idle);
      } catch (error) {
        console.error('Failed to load student tag catalog', error);
        if (!isMounted) {
          return;
        }
        setTagCatalog([]);
        setTagsState(REQUEST_STATE.error);
        setTagsError(error?.message || 'טעינת התגיות נכשלה.');
      }
    }

    void loadTagCatalog();

    return () => {
      isMounted = false;
    };
  }, [hasStudentTags, activeOrgId, studentIdentifier]);

  const handleOpenSessionModal = useCallback(() => {
    if (!studentId) {
      return;
    }
    openSessionModal?.({
      studentId,
      onCreated: async () => {
        await loadSessions();
      },
    });
  }, [openSessionModal, studentId, loadSessions]);

  const backDestination = isAdminRole(membershipRole) ? '/admin/students' : '/my-students';
  const canEdit = isAdminRole(membershipRole);

  const handleOpenEdit = () => {
    if (student && canEdit) {
      setUpdateError('');
      setStudentForEdit(student);
    }
  };

  const handleCloseEdit = () => {
    if (!isUpdatingStudent) {
      setStudentForEdit(null);
      setUpdateError('');
    }
  };

  const handleUpdateStudent = async (payload) => {
    if (!payload?.id || !activeOrgId) return;
    setIsUpdatingStudent(true);
    setUpdateError('');
    try {
      const normalizedTags = normalizeTagIdsForWrite(payload.tags);
      const body = {
        org_id: activeOrgId,
        name: payload.name,
        contact_name: payload.contactName,
        contact_phone: payload.contactPhone,
        assigned_instructor_id: payload.assignedInstructorId,
        default_service: payload.defaultService,
        default_day_of_week: payload.defaultDayOfWeek,
        default_session_time: payload.defaultSessionTime,
        notes: payload.notes,
        tags: normalizedTags,
      };
      await authenticatedFetch(`students/${payload.id}`, { method: 'PUT', body, session });
      setStudentForEdit(null);
      // Refresh the header info
      await loadStudent();
    } catch (error) {
      console.error('Failed to update student', error);
      setUpdateError(error?.message || 'עדכון התלמיד נכשל.');
    } finally {
      setIsUpdatingStudent(false);
    }
  };

  const handleExportPdf = async () => {
    if (!studentId || !activeOrgId || !student) {
      toast.error('לא ניתן לייצא PDF ללא מזהה תלמיד או ארגון.');
      return;
    }

    setIsExporting(true);
    try {
      const blob = await exportStudentPdf(studentId, activeOrgId);
      // Generate filename with date (sanitization happens in backend)
      const safeName = student.name
        .replace(/[^א-תa-zA-Z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '_');
      const dateStr = format(new Date(), 'yyyy-MM-dd');
      const filename = `${safeName}_Records_${dateStr}.pdf`;
      
      downloadPdfBlob(blob, filename);
      toast.success('הקובץ הורד בהצלחה');
    } catch (error) {
      console.error('Failed to export PDF', error);
      const message = error?.message || 'ייצוא PDF נכשל. נסה שוב.';
      toast.error(message);
    } finally {
      setIsExporting(false);
    }
  };

  if (!studentId) {
    return (
      <div className="space-y-md">
        <h1 className="text-xl font-semibold text-foreground">פרטי תלמיד</h1>
        <p className="text-sm text-neutral-600">לא נבחר תלמיד להצגה.</p>
      </div>
    );
  }

  if (supabaseLoading) {
    return (
      <div className="flex items-center justify-center gap-sm rounded-xl bg-neutral-50 p-lg text-neutral-600" role="status">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        <span>טוען חיבור מאובטח...</span>
      </div>
    );
  }

  if (!activeOrg) {
    return (
      <div className="rounded-xl bg-neutral-50 p-lg text-center text-neutral-600" role="status">
        בחרו ארגון כדי להציג את פרטי התלמיד.
      </div>
    );
  }

  if (!activeOrgHasConnection) {
    return (
      <div className="rounded-xl bg-amber-50 p-lg text-center text-amber-800" role="status">
        דרוש חיבור מאומת למסד הנתונים של הארגון כדי להציג את פרטי התלמיד.
      </div>
    );
  }

  const isStudentLoading = studentState === REQUEST_STATE.loading;
  const studentLoadError = studentState === REQUEST_STATE.error;
  const isSessionsLoading = sessionState === REQUEST_STATE.loading;
  const sessionsLoadError = sessionState === REQUEST_STATE.error;
  const noSessions = !isSessionsLoading && !sessionsLoadError && sessions.length === 0;

  const toggleOne = (key) => setExpandedById((prev) => ({ ...prev, [key]: !prev[key] }));
  const expandAll = () => setExpandedById((prev) => {
    const next = { ...prev };
    sessions.forEach((r) => { next[r.id || r.date] = true; });
    return next;
  });
  const collapseAll = () => setExpandedById((prev) => {
    const next = { ...prev };
    sessions.forEach((r) => { next[r.id || r.date] = false; });
    return next;
  });

  const contactName = student?.contact_name || 'לא סופק';
  const contactPhone = student?.contact_phone || '';
  const contactInfo = student?.contact_info || '';
  const defaultService = student?.default_service || 'לא הוגדר';
  const scheduleDescription = describeSchedule(student?.default_day_of_week, student?.default_session_time);
  const tagDisplayList = buildTagDisplayList(student?.tags, tagCatalog);
  const isTagsLoading = tagsState === REQUEST_STATE.loading;
  const tagsLoadError = tagsState === REQUEST_STATE.error;
  
  const assignedInstructor = instructors.find((inst) => inst?.id === student?.assigned_instructor_id);
  const instructorName = assignedInstructor?.name || (student?.assigned_instructor_id ? 'מדריך לא זמין' : 'לא הוקצה מדריך');

  return (
    <>
    <div className="space-y-md md:space-y-lg">
      <div className="flex flex-col gap-sm sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-xs">
          <h1 className="text-xl font-semibold text-foreground sm:text-2xl">פרטי תלמיד</h1>
          <p className="text-xs text-neutral-600 sm:text-sm">סקירת הפרטים והמפגשים של {student?.name || 'תלמיד ללא שם'}.</p>
        </div>
        <div className="flex gap-2 self-start flex-wrap">
        {canEdit ? (
          <>
            {permissions?.can_export_pdf_reports ? (
              <Button
                type="button"
                className="self-start text-sm"
                size="sm"
                onClick={handleExportPdf}
                disabled={studentLoadError || isStudentLoading || !student || isExporting}
                variant="outline"
              >
                {isExporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                <span className="ml-1">{isExporting ? 'מייצא...' : 'ייצוא ל-PDF'}</span>
              </Button>
            ) : (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      className="self-start text-sm"
                      size="sm"
                      disabled
                      variant="outline"
                    >
                      <Download className="h-4 w-4" />
                      <span className="ml-1">ייצוא ל-PDF (Premium)</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p className="text-sm">ייצוא ל-PDF הוא תכונת פרימיום. צור קשר עם התמיכה כדי להפעיל תכונה זו.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <Button
              type="button"
              className="self-start text-sm"
              size="sm"
              onClick={handleOpenEdit}
              disabled={studentLoadError || isStudentLoading || !student}
              variant="outline"
            >
              <Pencil className="h-4 w-4" />
              <span className="ml-1">עריכת תלמיד</span>
            </Button>
          </>
        ) : null}
        <Button
          type="button"
          className="self-start text-sm"
          size="sm"
          onClick={handleOpenSessionModal}
          disabled={studentLoadError || isStudentLoading || !student}
        >
          תעד מפגש חדש
        </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold text-foreground sm:text-lg">מידע כללי</CardTitle>
        </CardHeader>
        <CardContent>
          {isStudentLoading ? (
            <div className="flex items-center gap-sm text-neutral-600 text-sm" role="status">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              <span>טוען פרטי תלמיד...</span>
            </div>
          ) : studentLoadError ? (
            <div className="rounded-lg bg-red-50 p-sm text-xs text-red-700 sm:p-md sm:text-sm" role="alert">
              {studentError}
            </div>
          ) : student ? (
            <dl className="grid grid-cols-2 gap-md text-sm sm:gap-lg lg:grid-cols-3">
              <div className="space-y-1">
                <dt className="text-xs font-medium text-neutral-500 sm:text-sm">שם התלמיד</dt>
                <dd className="font-semibold text-foreground">{student.name}</dd>
              </div>
              <div className="space-y-1">
                <dt className="text-xs font-medium text-neutral-500 sm:text-sm">מדריך מוקצה</dt>
                <dd className="text-foreground">{instructorName}</dd>
              </div>
              <div className="space-y-1">
                <dt className="text-xs font-medium text-neutral-500 sm:text-sm">שירות ברירת מחדל</dt>
                <dd className="text-foreground">{defaultService}</dd>
              </div>
              <div className="space-y-1">
                <dt className="text-xs font-medium text-neutral-500 sm:text-sm">יום ושעה</dt>
                <dd className="text-foreground">{scheduleDescription}</dd>
              </div>
              {student?.default_session_time ? (
                <div className="space-y-1">
                  <dt className="text-xs font-medium text-neutral-500 sm:text-sm">שעה</dt>
                  <dd className="text-foreground">{formatDefaultTime(student.default_session_time)}</dd>
                </div>
              ) : null}
              <div className="space-y-1">
                <dt className="text-xs font-medium text-neutral-500 sm:text-sm">שם איש קשר</dt>
                <dd className="text-foreground">{contactName}</dd>
              </div>
              {contactPhone ? (
                <div className="space-y-1">
                  <dt className="text-xs font-medium text-neutral-500 sm:text-sm">טלפון</dt>
                  <dd className="text-foreground">
                    <a href={`tel:${contactPhone}`} className="text-primary hover:underline">
                      {contactPhone}
                    </a>
                  </dd>
                </div>
              ) : null}
              {contactInfo ? (
                <div className="space-y-1 col-span-2 lg:col-span-3">
                  <dt className="text-xs font-medium text-neutral-500 sm:text-sm">מידע נוסף</dt>
                  <dd className="whitespace-pre-wrap break-words text-foreground">{contactInfo}</dd>
                </div>
              ) : null}
              {hasStudentTags ? (
                <div className="space-y-1 col-span-2 lg:col-span-3">
                  <dt className="text-xs font-medium text-neutral-500 sm:text-sm">תגיות</dt>
                  <dd>
                    {isTagsLoading ? (
                      <span className="text-xs text-neutral-500 sm:text-sm">טוען תגיות...</span>
                    ) : tagsLoadError ? (
                      <span className="text-xs text-red-600 sm:text-sm">{tagsError}</span>
                    ) : tagDisplayList.length ? (
                      <div className="flex flex-wrap gap-2">
                        {tagDisplayList.map((tag) => (
                          <Badge
                            key={tag.id}
                            variant={tag.missing ? 'outline' : 'secondary'}
                            title={tag.missing ? 'תגית זו אינה קיימת עוד בקטלוג' : undefined}
                            className="text-xs sm:text-sm"
                          >
                            {tag.name}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-neutral-500 sm:text-sm">לא נמצאו תגיות תואמות.</span>
                    )}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : (
            <p className="text-xs text-neutral-600 sm:text-sm">לא נמצאו פרטי תלמיד להצגה.</p>
          )}
        </CardContent>
      </Card>

      <div className="space-y-sm md:space-y-md">
        <div className="flex items-center justify-between gap-sm">
          <h2 className="text-base font-semibold text-foreground sm:text-lg">היסטוריית מפגשים</h2>
          <div className="flex items-center gap-xs">
            {sessions.length > 1 ? (
              <div className="hidden gap-xs sm:flex">
                <Button type="button" variant="outline" size="sm" onClick={expandAll}>
                  פתח הכל
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={collapseAll}>
                  כווץ הכל
                </Button>
              </div>
            ) : null}
            <Link to={backDestination} className="inline-flex items-center gap-xs text-xs text-primary hover:underline sm:text-sm">
              חזרה לרשימת התלמידים
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
        {questionsState === REQUEST_STATE.error ? (
          <div className="rounded-lg bg-amber-50 p-sm text-xs text-amber-800 sm:p-md sm:text-sm" role="status">
            {questionsError}
          </div>
        ) : null}
        {isSessionsLoading ? (
          <div className="flex items-center gap-sm text-xs text-neutral-600 sm:text-sm" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>טוען היסטוריית מפגשים...</span>
          </div>
        ) : sessionsLoadError ? (
          <div className="rounded-lg bg-red-50 p-sm text-xs text-red-700 sm:p-md sm:text-sm" role="alert">
            {sessionError}
          </div>
        ) : noSessions ? (
          <div className="rounded-xl border border-dashed border-neutral-300 p-md text-center text-xs text-neutral-600 sm:p-lg sm:text-sm">
            טרם תועדו מפגשים עבור תלמיד זה.
          </div>
        ) : (
          <div className="space-y-sm md:space-y-md">
            {sessions.map((record) => {
              // Extract form version from session metadata (null if not set)
              const formVersion = record?.metadata?.form_version ?? null;
              
              // Get questions for this session's version (falls back to current if version not found/null)
              const versionedQuestions = formConfig 
                ? getQuestionsForVersion(formConfig, formVersion)
                : questions; // Fallback to current questions if config not loaded
              
              const answers = buildAnswerList(record.content, versionedQuestions);
              const key = record.id || record.date;
              const isOpen = Boolean(expandedById[key]);
              return (
                <Card key={key}>
                  <CardHeader className="space-y-xs">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-sm text-right"
                      onClick={() => toggleOne(key)}
                      aria-expanded={isOpen}
                      aria-controls={`session-${key}`}
                    >
                      <div className="space-y-1 text-right">
                        <CardTitle className="text-sm font-semibold text-foreground sm:text-base">
                          {formatSessionDate(record.date)}
                        </CardTitle>
                        <p className="text-xs text-neutral-500 sm:text-sm">
                          {record.service_context ? `שירות: ${record.service_context}` : 'ללא שירות מוגדר'}
                        </p>
                      </div>
                      {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </CardHeader>
                  <CardContent id={`session-${key}`} hidden={!isOpen} className="space-y-xs sm:space-y-sm">
                    {answers.length ? (
                      <dl className="space-y-xs sm:space-y-sm">
                        {answers.map((entry, index) => (
                          <div key={`${record.id}-${entry.label}`} className="space-y-xs">
                            <dt className="text-xs font-medium text-neutral-600 sm:text-sm">{entry.label}</dt>
                            <dd className="whitespace-pre-wrap break-words text-xs text-neutral-800 sm:text-sm">{entry.value}</dd>
                            {index < answers.length - 1 ? <Separator /> : null}
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p className="text-xs text-neutral-500 sm:text-sm">לא תועדו תשובות עבור מפגש זה.</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
    <EditStudentModal
      open={Boolean(studentForEdit)}
      onClose={handleCloseEdit}
      student={studentForEdit}
      onSubmit={handleUpdateStudent}
      isSubmitting={isUpdatingStudent}
      error={updateError}
    />
    </>
  );
}
