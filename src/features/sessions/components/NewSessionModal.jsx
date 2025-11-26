import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
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

function SuccessFooter({ studentName, onClose, onNewReport, onNewReportSameStudent }) {
  return (
    <div className="flex flex-col gap-sm">
      <div className="rounded-lg bg-success-50 p-md text-center">
        <p className="text-sm font-medium text-success-700">
          ✓ מפגש עבור {studentName} נשמר בהצלחה!
        </p>
      </div>
      <div className="flex flex-col gap-sm sm:flex-row-reverse sm:justify-end">
        <Button 
          onClick={onNewReportSameStudent}
          className="gap-xs shadow-md hover:shadow-lg transition-shadow"
        >
          דיווח נוסף - {studentName}
        </Button>
        <Button 
          onClick={onNewReport}
          variant="secondary"
          className="gap-xs shadow-sm hover:shadow-md transition-shadow"
        >
          דיווח נוסף - תלמיד אחר
        </Button>
        <Button 
          onClick={onClose}
          variant="outline"
          className="hover:shadow-sm"
        >
          סגור
        </Button>
      </div>
    </div>
  );
}

export default function NewSessionModal({
  open,
  onClose,
  initialStudentId = '',
  initialStudentStatus = 'active',
  initialDate = '', // YYYY-MM-DD format
  onCreated,
}) {
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
  const [statusFilter, setStatusFilter] = useState('active'); // 'active' | 'inactive' | 'all'
  const [canViewInactive, setCanViewInactive] = useState(false);
  const [visibilityLoaded, setVisibilityLoaded] = useState(false);
  const [initialStatusApplied, setInitialStatusApplied] = useState(false);
  const [successState, setSuccessState] = useState(null); // { studentId, studentName, date }
  const formResetRef = useRef(null); // Will hold the form's reset function

  // Fix for mobile: prevent Dialog close when Select is open/closing
  const openSelectCountRef = useRef(0);
  const isClosingSelectRef = useRef(false);

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
    const isAdmin = isAdminRole(membershipRole);
    if (!open) {
      setStatusFilter('active');
      setCanViewInactive(isAdmin);
      setVisibilityLoaded(false);
      setInitialStatusApplied(false);
      return;
    }

    if (isAdmin) {
      setCanViewInactive(true);
      setVisibilityLoaded(true);
      return;
    }

    if (!activeOrgId || !activeOrgHasConnection || !tenantClientReady) {
      setCanViewInactive(false);
      setVisibilityLoaded(false);
      if (statusFilter !== 'active') {
        setStatusFilter('active');
      }
      setInitialStatusApplied(false);
      return;
    }

    let cancelled = false;
    const abortController = new AbortController();

    const loadVisibilitySetting = async () => {
      try {
        const searchParams = new URLSearchParams({ org_id: activeOrgId, keys: 'instructors_can_view_inactive_students' });
        const payload = await authenticatedFetch(`settings?${searchParams.toString()}`, {
          signal: abortController.signal,
        });
        const entry = payload?.settings?.instructors_can_view_inactive_students;
        const value = entry && typeof entry === 'object' && Object.prototype.hasOwnProperty.call(entry, 'value')
          ? entry.value
          : entry;
        const allowed = value === true;
        if (!cancelled) {
          setCanViewInactive(allowed);
          setVisibilityLoaded(true);
          if (!allowed && statusFilter !== 'active') {
            setStatusFilter('active');
          }
          if (!allowed) {
            setInitialStatusApplied(false);
          }
        }
      } catch (error) {
        if (error?.name === 'AbortError') {
          return;
        }
        console.error('Failed to load inactive visibility setting for session modal', error);
        if (!cancelled) {
          setCanViewInactive(false);
          setVisibilityLoaded(true);
          if (statusFilter !== 'active') {
            setStatusFilter('active');
          }
          setInitialStatusApplied(false);
        }
      }
    };

    void loadVisibilitySetting();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [open, membershipRole, activeOrgId, activeOrgHasConnection, tenantClientReady, statusFilter]);

  useEffect(() => {
    if (!open) {
      setSubmitState(REQUEST_STATE.idle);
      setSubmitError('');
      setSuccessState(null);
    }
  }, [open]);

  const loadStudents = useCallback(async (options = {}) => {
    if (!canFetchStudents) {
      return;
    }

    setStudentsState(REQUEST_STATE.loading);
    setStudentsError('');

    try {
      // Determine endpoint and optional server-side filter based on scope and role
      const overrideStatus = typeof options.status === 'string' ? options.status : null;
      const statusParam = canViewInactive ? (overrideStatus || statusFilter) : 'active';
      const baseEndpoint = buildStudentsEndpoint(activeOrgId, membershipRole, { status: statusParam });
      let endpoint = baseEndpoint;
      const isAdmin = isAdminRole(membershipRole);
      if (isAdmin) {
        if (studentScope === 'mine') {
          // Admin viewing their own assigned students -> use my-students
          const searchParams = new URLSearchParams();
          if (activeOrgId) searchParams.set('org_id', activeOrgId);
          if (statusParam) searchParams.set('status', statusParam);
          endpoint = searchParams.toString() ? `my-students?${searchParams}` : 'my-students';
        } else if (studentScope.startsWith('inst:')) {
          const instructorId = studentScope.slice(5);
          const searchParams = new URLSearchParams();
          if (activeOrgId) searchParams.set('org_id', activeOrgId);
          if (instructorId) searchParams.set('assigned_instructor_id', instructorId);
          if (statusParam) searchParams.set('status', statusParam);
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
  }, [activeOrgId, canFetchStudents, membershipRole, studentScope, statusFilter, canViewInactive]);

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
      void loadQuestions();
      void loadServices();
      void loadInstructors();
    } else {
      setStudentsState(REQUEST_STATE.idle);
      setStudentsError('');
      setStudents([]);
      setInitialStatusApplied(false);
      setQuestionsState(REQUEST_STATE.idle);
      setQuestionError('');
      setQuestions([]);
      setSuggestions({});
      setServices([]);
      setInstructors([]);
      setStudentScope('all');
    }
  }, [open, loadQuestions, loadServices, loadInstructors]);

  useEffect(() => {
    if (!open || !canFetchStudents) {
      return;
    }

    if (!canViewInactive && statusFilter !== 'active') {
      setStatusFilter('active');
      setInitialStatusApplied(false);
      return;
    }

    const shouldForceInactive = (
      canViewInactive &&
      initialStudentId &&
      initialStudentStatus === 'inactive' &&
      !initialStatusApplied
    );

    if (shouldForceInactive && statusFilter !== 'inactive') {
      setStatusFilter('inactive');
      setInitialStatusApplied(true);
      return;
    }

    if (shouldForceInactive && statusFilter === 'inactive') {
      setInitialStatusApplied(true);
    }

    const effectiveStatus = canViewInactive ? statusFilter : 'active';
    void loadStudents({ status: effectiveStatus });
  }, [
    open,
    canFetchStudents,
    canViewInactive,
    statusFilter,
    initialStudentId,
    initialStudentStatus,
    initialStatusApplied,
    loadStudents,
  ]);

  // Mobile fix: Track Select open/close state to prevent Dialog from closing
  const handleSelectOpenChange = useCallback((isOpen) => {
    if (!isOpen && openSelectCountRef.current > 0) {
      isClosingSelectRef.current = true;
      setTimeout(() => {
        openSelectCountRef.current -= 1;
        if (openSelectCountRef.current < 0) {
          openSelectCountRef.current = 0;
        }
        isClosingSelectRef.current = false;
      }, 100);
    } else if (isOpen) {
      openSelectCountRef.current += 1;
    }
  }, []);

  // Mobile fix: Prevent Dialog close if Select is open or closing
  const handleDialogInteractOutside = useCallback((event) => {
    if (openSelectCountRef.current > 0 || isClosingSelectRef.current) {
      event.preventDefault();
    }
  }, []);

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
      
      // Enhanced toast with longer duration for mobile visibility
      toast.success('המפגש נשמר בהצלחה.', { 
        duration: 2500,
        position: 'top-center',
      });
      
      // Wait for the onCreated callback to complete
      // This ensures any data refresh in the parent component completes
      await Promise.resolve(onCreated?.(record));
      
      // Find student name for success message
      const student = students.find(s => s.id === studentId);
      const studentName = student?.name || 'תלמיד';
      
      // Show success state instead of closing
      setSuccessState({ studentId, studentName, date });
      setSubmitState(REQUEST_STATE.idle);
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

  const handleCloseAfterSuccess = useCallback(() => {
    setSuccessState(null);
    onClose?.();
  }, [onClose]);

  const handleNewReport = useCallback(() => {
    setSuccessState(null);
    // Reset form using the ref
    if (formResetRef.current) {
      formResetRef.current();
    }
  }, []);

  const handleNewReportSameStudent = useCallback(() => {
    if (!successState) return;
    setSuccessState(null);
    // Reset form but keep the same student
    if (formResetRef.current) {
      formResetRef.current({ keepStudent: true, studentId: successState.studentId });
    }
  }, [successState]);

  const dialogTitle = canFetchStudents
    ? 'רישום מפגש חדש'
    : 'לא ניתן ליצור מפגש חדש';

  const isLoadingStudents = studentsState === REQUEST_STATE.loading;
  const isLoadingQuestions = questionsState === REQUEST_STATE.loading;
  const showLoading = isLoadingStudents || isLoadingQuestions;

  const [isFormValid, setIsFormValid] = useState(false);

  const footer = canFetchStudents && !showLoading && studentsState !== REQUEST_STATE.error ? (
    successState ? (
      <SuccessFooter
        studentName={successState.studentName}
        onClose={handleCloseAfterSuccess}
        onNewReport={handleNewReport}
        onNewReportSameStudent={handleNewReportSameStudent}
      />
    ) : (
      <NewSessionFormFooter
        onSubmit={() => {
          // Trigger form submission via form id
          document.getElementById('new-session-form')?.requestSubmit();
        }}
        onCancel={onClose}
        isSubmitting={submitState === REQUEST_STATE.loading}
        isFormValid={isFormValid}
      />
    )
  ) : null;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) { onClose?.(); } }}>
      <DialogContent 
        className="sm:max-w-xl" 
        footer={footer}
        onInteractOutside={handleDialogInteractOutside}
      >
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
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            canViewInactive={canViewInactive}
            visibilityLoaded={visibilityLoaded}
            initialStudentId={initialStudentId}
            initialDate={initialDate}
            isLoadingStudents={isLoadingStudents}
            onSubmit={handleSubmit}
            onCancel={onClose}
            isSubmitting={submitState === REQUEST_STATE.loading}
            error={submitError || (questionsState === REQUEST_STATE.error ? questionError : '')}
            renderFooterOutside={true}
            onFormValidityChange={setIsFormValid}
            onSelectOpenChange={handleSelectOpenChange}
            formResetRef={formResetRef}
            successState={successState}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
