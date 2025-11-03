import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useOrg } from '@/org/OrgContext.jsx';
import { useSupabase } from '@/context/SupabaseContext.jsx';
import { authenticatedFetch } from '@/lib/api-client.js';
import NewSessionForm, { NewSessionFormFooter } from './NewSessionForm.jsx';
import { ensureSessionFormFallback, parseSessionFormConfig } from '@/features/sessions/utils/form-config.js';
import { buildStudentsEndpoint, normalizeMembershipRole, isAdminRole } from '@/features/students/utils/endpoints.js';

const REQUEST_STATE = Object.freeze({
  idle: 'idle',
  loading: 'loading',
  error: 'error',
});

export default function NewSessionModal({ open, onClose, initialStudentId = '', onCreated }) {
  const { loading: supabaseLoading } = useSupabase();
  const { activeOrg, activeOrgHasConnection, tenantClientReady } = useOrg();
  const [studentsState, setStudentsState] = useState(REQUEST_STATE.idle);
  const [studentsError, setStudentsError] = useState('');
  const [students, setStudents] = useState([]);
  const [questionsState, setQuestionsState] = useState(REQUEST_STATE.idle);
  const [questionError, setQuestionError] = useState('');
  const [questions, setQuestions] = useState([]);
  const [suggestions, setSuggestions] = useState({});
  const [services, setServices] = useState([]);
  const [submitState, setSubmitState] = useState(REQUEST_STATE.idle);
  const [submitError, setSubmitError] = useState('');
  const [instructors, setInstructors] = useState([]);
  const [studentScope, setStudentScope] = useState('all'); // 'all' | 'mine' | `inst:<id>`

  const activeOrgId = activeOrg?.id || null;
  const membershipRole = normalizeMembershipRole(activeOrg?.membership?.role);
  const canFetchStudents = useMemo(() => {
    return (
      open &&
      Boolean(activeOrgId) &&
      activeOrgHasConnection &&
      tenantClientReady &&
      !supabaseLoading
    );
  }, [open, activeOrgId, activeOrgHasConnection, tenantClientReady, supabaseLoading]);

  useEffect(() => {
    if (!open) {
      setSubmitState(REQUEST_STATE.idle);
      setSubmitError('');
    }
  }, [open]);

  const loadStudents = useCallback(async () => {
    if (!canFetchStudents) {
      return;
    }

    setStudentsState(REQUEST_STATE.loading);
    setStudentsError('');

    try {
      // Determine endpoint and optional server-side filter based on scope and role
      const baseEndpoint = buildStudentsEndpoint(activeOrgId, membershipRole);
      let endpoint = baseEndpoint;
      const isAdmin = isAdminRole(membershipRole);
      if (isAdmin) {
        if (studentScope === 'mine') {
          // Admin viewing their own assigned students -> use my-students
          const searchParams = new URLSearchParams();
          if (activeOrgId) searchParams.set('org_id', activeOrgId);
          endpoint = searchParams.toString() ? `my-students?${searchParams}` : 'my-students';
        } else if (studentScope.startsWith('inst:')) {
          const instructorId = studentScope.slice(5);
          const searchParams = new URLSearchParams();
          if (activeOrgId) searchParams.set('org_id', activeOrgId);
          if (instructorId) searchParams.set('assigned_instructor_id', instructorId);
          endpoint = searchParams.toString() ? `students?${searchParams}` : 'students';
        }
      }

      const payload = await authenticatedFetch(endpoint);
      setStudents(Array.isArray(payload) ? payload : []);
      setStudentsState(REQUEST_STATE.idle);
    } catch (error) {
      console.error('Failed to load session students', error);
      setStudents([]);
      setStudentsState(REQUEST_STATE.error);
      setStudentsError(error?.message || 'טעינת רשימת התלמידים נכשלה.');
    }
  }, [activeOrgId, canFetchStudents, membershipRole, studentScope]);

  const loadInstructors = useCallback(async () => {
    if (!open || !canFetchStudents) return;
    if (!isAdminRole(membershipRole)) return;
    try {
      const searchParams = new URLSearchParams();
      if (activeOrgId) searchParams.set('org_id', activeOrgId);
      const payload = await authenticatedFetch(`instructors?${searchParams.toString()}`);
      setInstructors(Array.isArray(payload) ? payload : []);
    } catch (error) {
      console.error('Failed to load instructors', error);
      setInstructors([]);
    }
  }, [open, canFetchStudents, membershipRole, activeOrgId]);

  const loadQuestions = useCallback(async () => {
    if (!open || !canFetchStudents) {
      return;
    }

    setQuestionsState(REQUEST_STATE.loading);
    setQuestionError('');

    try {
      const searchParams = new URLSearchParams({ keys: 'session_form_config', include_metadata: '1' });
      if (activeOrgId) {
        searchParams.set('org_id', activeOrgId);
      }
      const payload = await authenticatedFetch(`settings?${searchParams.toString()}`);
      const entry = payload?.settings?.session_form_config ?? null;
      const settingsValue = entry && typeof entry === 'object' && Object.prototype.hasOwnProperty.call(entry, 'value') ? entry.value : entry;
      const normalized = ensureSessionFormFallback(parseSessionFormConfig(settingsValue));
      const metadata = entry && typeof entry === 'object' && Object.prototype.hasOwnProperty.call(entry, 'metadata') ? entry.metadata : null;
      const preanswers = metadata && typeof metadata === 'object' && metadata.preconfigured_answers && typeof metadata.preconfigured_answers === 'object'
        ? metadata.preconfigured_answers
        : {};
      setQuestions(normalized);
      setSuggestions(preanswers);
      setQuestionsState(REQUEST_STATE.idle);
    } catch (error) {
      console.error('Failed to load session form configuration', error);
      setQuestions(ensureSessionFormFallback([]));
      setQuestionsState(REQUEST_STATE.error);
      setQuestionError(error?.message || 'טעינת שאלות המפגש נכשלה.');
    }
  }, [open, canFetchStudents, activeOrgId]);

  const loadServices = useCallback(async () => {
    if (!open || !canFetchStudents) return;
    try {
      const searchParams = new URLSearchParams({ keys: 'available_services' });
      if (activeOrgId) searchParams.set('org_id', activeOrgId);
      const payload = await authenticatedFetch(`settings?${searchParams.toString()}`);
      const settingsValue = payload?.settings?.available_services;
      setServices(Array.isArray(settingsValue) ? settingsValue : []);
    } catch (error) {
      console.error('Failed to load available services', error);
      setServices([]);
    }
  }, [open, canFetchStudents, activeOrgId]);

  useEffect(() => {
    if (open) {
      void loadStudents();
      void loadQuestions();
      void loadServices();
      void loadInstructors();
    } else {
      setStudentsState(REQUEST_STATE.idle);
      setStudentsError('');
      setStudents([]);
      setQuestionsState(REQUEST_STATE.idle);
      setQuestionError('');
      setQuestions([]);
      setSuggestions({});
      setServices([]);
      setInstructors([]);
      setStudentScope('all');
    }
  }, [open, loadQuestions, loadStudents, loadServices, loadInstructors]);

  const handleSubmit = async ({ studentId, date, serviceContext, answers }) => {
    setSubmitState(REQUEST_STATE.loading);
    setSubmitError('');

    try {
      const body = {
        student_id: studentId,
        date,
        service_context: serviceContext,
        content: answers,
        org_id: activeOrgId,
      };
      const record = await authenticatedFetch('sessions', {
        method: 'POST',
        body,
      });
      toast.success('המפגש נשמר בהצלחה.');
      setSubmitState(REQUEST_STATE.idle);
      // Wait for the onCreated callback to complete before closing
      // This ensures any data refresh in the parent component completes
      await Promise.resolve(onCreated?.(record));
      onClose?.();
    } catch (error) {
      console.error('Failed to save session record', error);
      setSubmitState(REQUEST_STATE.error);
      // Map known server messages to clear, localized explanations
      const serverMessage = error?.data?.message || error?.message || '';
      let friendly = 'שמירת המפגש נכשלה.';
      if (serverMessage === 'student_missing_instructor') {
        friendly = 'לא ניתן לתעד מפגש: לתלמיד זה לא משויך מדריך פעיל. נא לשייך מדריך תחילה.';
      } else if (serverMessage === 'student_not_assigned_to_user') {
        friendly = 'לא ניתן לתעד: תלמיד זה לא משויך אליך.';
      }
      setSubmitError(friendly);
    }
  };

  const dialogTitle = canFetchStudents
    ? 'רישום מפגש חדש'
    : 'לא ניתן ליצור מפגש חדש';

  const isLoadingStudents = studentsState === REQUEST_STATE.loading;
  const isLoadingQuestions = questionsState === REQUEST_STATE.loading;
  const showLoading = isLoadingStudents || isLoadingQuestions;

  // Track selected student for footer button state
  const [selectedStudentId, setSelectedStudentId] = useState('');

  const footer = canFetchStudents && !showLoading && studentsState !== REQUEST_STATE.error ? (
    <NewSessionFormFooter
      onSubmit={() => {
        // Trigger form submission via form id
        document.getElementById('new-session-form')?.requestSubmit();
      }}
      onCancel={onClose}
      isSubmitting={submitState === REQUEST_STATE.loading}
      selectedStudentId={selectedStudentId}
    />
  ) : null;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) { onClose?.(); } }}>
      <DialogContent className="sm:max-w-xl" footer={footer}>
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
        </DialogHeader>

        {!canFetchStudents ? (
          <div className="space-y-sm text-sm text-neutral-600">
            <p>יש לבחור ארגון בעל חיבור פעיל כדי ליצור מפגש חדש.</p>
          </div>
        ) : showLoading ? (
          <div className="flex items-center justify-center gap-sm py-lg text-neutral-600" role="status">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            <span>טוען נתונים...</span>
          </div>
        ) : studentsState === REQUEST_STATE.error ? (
          <div className="rounded-lg bg-red-50 p-md text-sm text-red-700" role="alert">
            {studentsError || 'טעינת רשימת התלמידים נכשלה.'}
          </div>
        ) : (
          <NewSessionForm
            students={students}
            questions={questions}
            suggestions={suggestions}
            services={services}
            instructors={instructors}
            canFilterByInstructor={isAdminRole(membershipRole)}
            studentScope={studentScope}
            onScopeChange={(next) => setStudentScope(next)}
            initialStudentId={initialStudentId}
            onSubmit={handleSubmit}
            onCancel={onClose}
            isSubmitting={submitState === REQUEST_STATE.loading}
            error={submitError || (questionsState === REQUEST_STATE.error ? questionError : '')}
            renderFooterOutside={true}
            onSelectedStudentChange={setSelectedStudentId}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
