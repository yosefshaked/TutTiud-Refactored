import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Loader2, ArrowRight, Phone, Calendar, Clock, User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useSupabase } from '@/context/SupabaseContext.jsx';
import { useOrg } from '@/org/OrgContext.jsx';
import { authenticatedFetch } from '@/lib/api-client.js';
import { describeSchedule, formatDefaultTime } from '@/features/students/utils/schedule.js';
import { ensureSessionFormFallback, parseSessionFormConfig } from '@/features/sessions/utils/form-config.js';
import { buildStudentsEndpoint, normalizeMembershipRole, isAdminRole } from '@/features/students/utils/endpoints.js';
import { useSessionModal } from '@/features/sessions/context/SessionModalContext.jsx';
import { format, parseISO } from 'date-fns';
import { he } from 'date-fns/locale';

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
  const { loading: supabaseLoading } = useSupabase();
  const { activeOrg, activeOrgHasConnection, tenantClientReady } = useOrg();
  const { openSessionModal } = useSessionModal();

  const [studentState, setStudentState] = useState(REQUEST_STATE.idle);
  const [studentError, setStudentError] = useState('');
  const [student, setStudent] = useState(null);

  const [sessionState, setSessionState] = useState(REQUEST_STATE.idle);
  const [sessionError, setSessionError] = useState('');
  const [sessions, setSessions] = useState([]);

  const [questionsState, setQuestionsState] = useState(REQUEST_STATE.idle);
  const [questionsError, setQuestionsError] = useState('');
  const [questions, setQuestions] = useState([]);

  const activeOrgId = activeOrg?.id || null;
  const membershipRole = normalizeMembershipRole(activeOrg?.membership?.role);

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
      const normalized = ensureSessionFormFallback(parseSessionFormConfig(settingsValue));
      setQuestions(normalized);
      setQuestionsState(REQUEST_STATE.idle);
    } catch (error) {
      console.error('Failed to load session form configuration', error);
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

  useEffect(() => {
    if (canFetch) {
      void loadStudent();
      void loadQuestions();
      void loadSessions();
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
    }
  }, [canFetch, loadStudent, loadQuestions, loadSessions]);

  const handleOpenSessionModal = useCallback(() => {
    if (!studentId) {
      return;
    }
    openSessionModal?.({
      studentId,
      onCreated: () => {
        void loadSessions();
      },
    });
  }, [openSessionModal, studentId, loadSessions]);

  const backDestination = isAdminRole(membershipRole) ? '/admin/students' : '/my-students';

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

  const contactName = student?.contact_name || 'לא סופק';
  const contactPhone = student?.contact_phone || '';
  const contactInfo = student?.contact_info || '';
  const defaultService = student?.default_service || 'לא הוגדר';
  const scheduleDescription = describeSchedule(student?.default_day_of_week, student?.default_session_time);

  return (
    <div className="space-y-xl">
      <div className="flex flex-col gap-sm sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-xs">
          <h1 className="text-2xl font-semibold text-foreground">פרטי תלמיד</h1>
          <p className="text-sm text-neutral-600">סקירת הפרטים והמפגשים של {student?.name || 'תלמיד ללא שם'}.</p>
        </div>
        <Button
          type="button"
          className="self-start"
          onClick={handleOpenSessionModal}
          disabled={studentLoadError || isStudentLoading || !student}
        >
          תעד מפגש חדש
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-foreground">מידע כללי</CardTitle>
        </CardHeader>
        <CardContent>
          {isStudentLoading ? (
            <div className="flex items-center gap-sm text-neutral-600" role="status">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              <span>טוען פרטי תלמיד...</span>
            </div>
          ) : studentLoadError ? (
            <div className="rounded-lg bg-red-50 p-md text-sm text-red-700" role="alert">
              {studentError}
            </div>
          ) : student ? (
            <dl className="grid gap-lg sm:grid-cols-2">
              <div className="space-y-xs">
                <dt className="flex items-center gap-xs text-sm font-medium text-neutral-600">
                  <User className="h-4 w-4" aria-hidden="true" />
                  שם התלמיד
                </dt>
                <dd className="text-base font-semibold text-foreground">{student.name}</dd>
              </div>
              <div className="space-y-xs">
                <dt className="flex items-center gap-xs text-sm font-medium text-neutral-600">
                  <Phone className="h-4 w-4" aria-hidden="true" />
                  איש קשר
                </dt>
                <dd className="text-base text-foreground">{contactName}</dd>
                {contactPhone ? (
                  <dd className="text-sm text-neutral-600">טלפון: {contactPhone}</dd>
                ) : null}
              </div>
              <div className="space-y-xs">
                <dt className="flex items-center gap-xs text-sm font-medium text-neutral-600">
                  <Calendar className="h-4 w-4" aria-hidden="true" />
                  יום ושעה קבועים
                </dt>
                <dd className="text-base text-foreground">{scheduleDescription}</dd>
                {student?.default_session_time ? (
                  <dd className="text-sm text-neutral-600">שעת ברירת מחדל: {formatDefaultTime(student.default_session_time)}</dd>
                ) : null}
              </div>
              <div className="space-y-xs">
                <dt className="flex items-center gap-xs text-sm font-medium text-neutral-600">
                  <Clock className="h-4 w-4" aria-hidden="true" />
                  שירות ברירת מחדל
                </dt>
                <dd className="text-base text-foreground">{defaultService}</dd>
              </div>
              {contactInfo ? (
                <div className="space-y-xs sm:col-span-2">
                  <dt className="text-sm font-medium text-neutral-600">פרטי קשר נוספים</dt>
                  <dd className="whitespace-pre-wrap text-sm text-neutral-700">{contactInfo}</dd>
                </div>
              ) : null}
            </dl>
          ) : (
            <p className="text-sm text-neutral-600">לא נמצאו פרטי תלמיד להצגה.</p>
          )}
        </CardContent>
      </Card>

      <div className="space-y-md">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">היסטוריית מפגשים</h2>
          <Link to={backDestination} className="inline-flex items-center gap-xs text-sm text-primary hover:underline">
            חזרה לרשימת התלמידים
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        {questionsState === REQUEST_STATE.error ? (
          <div className="rounded-lg bg-amber-50 p-md text-sm text-amber-800" role="status">
            {questionsError}
          </div>
        ) : null}
        {isSessionsLoading ? (
          <div className="flex items-center gap-sm text-neutral-600" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>טוען היסטוריית מפגשים...</span>
          </div>
        ) : sessionsLoadError ? (
          <div className="rounded-lg bg-red-50 p-md text-sm text-red-700" role="alert">
            {sessionError}
          </div>
        ) : noSessions ? (
          <div className="rounded-xl border border-dashed border-neutral-300 p-lg text-center text-neutral-600">
            טרם תועדו מפגשים עבור תלמיד זה.
          </div>
        ) : (
          <div className="space-y-md">
            {sessions.map((record) => {
              const answers = buildAnswerList(record.content, questions);
              return (
                <Card key={record.id || record.date}>
                  <CardHeader className="space-y-xs">
                    <div className="flex flex-wrap items-center justify-between gap-sm">
                      <div className="space-y-1">
                        <CardTitle className="text-base font-semibold text-foreground">
                          {formatSessionDate(record.date)}
                        </CardTitle>
                        <p className="text-sm text-neutral-500">
                          {record.service_context ? `שירות: ${record.service_context}` : 'ללא שירות מוגדר'}
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-sm">
                    {answers.length ? (
                      <dl className="space-y-sm">
                        {answers.map((entry, index) => (
                          <div key={`${record.id}-${entry.label}`} className="space-y-xs">
                            <dt className="text-sm font-medium text-neutral-600">{entry.label}</dt>
                            <dd className="whitespace-pre-wrap text-sm text-neutral-800">{entry.value}</dd>
                            {index < answers.length - 1 ? <Separator /> : null}
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p className="text-sm text-neutral-500">לא תועדו תשובות עבור מפגש זה.</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
