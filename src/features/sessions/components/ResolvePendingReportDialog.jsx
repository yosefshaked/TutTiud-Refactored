import React, { useEffect, useState, useMemo } from 'react';
import { Loader2, UserCheck, UserPlus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ComboBoxField } from '@/components/ui/forms-ui';
import { useOrg } from '@/org/OrgContext.jsx';
import { authenticatedFetch } from '@/lib/api-client.js';
import { assignLooseSession, createAndAssignLooseSession } from '@/features/sessions/api/loose-sessions.js';

const REQUEST_STATE = Object.freeze({
  idle: 'idle',
  loading: 'loading',
  error: 'error',
});

export default function ResolvePendingReportDialog({ open, onClose, report, onResolved }) {
  const { activeOrg } = useOrg();
  const [mode, setMode] = useState('assign'); // 'assign' | 'create'
  const [state, setState] = useState(REQUEST_STATE.idle);
  const [error, setError] = useState('');
  
  // Assign existing mode
  const [studentQuery, setStudentQuery] = useState('');
  const [students, setStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [loadingStudents, setLoadingStudents] = useState(false);
  
  // Create new mode
  const [newStudentName, setNewStudentName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [instructorId, setInstructorId] = useState('');
  const [defaultService, setDefaultService] = useState('');
  const [instructors, setInstructors] = useState([]);
  const [services, setServices] = useState([]);
  const [loadingInstructors, setLoadingInstructors] = useState(false);
  const [loadingServices, setLoadingServices] = useState(false);

  const activeOrgId = activeOrg?.id || null;
  const unassignedName = report?.metadata?.unassigned_details?.name || '';
  const reportService = report?.service_context || '';

  // Load students for assign mode
  useEffect(() => {
    if (!open || mode !== 'assign' || !activeOrgId) {
      setStudents([]);
      return;
    }

    const abortController = new AbortController();
    setLoadingStudents(true);

    const loadStudents = async () => {
      try {
        const params = new URLSearchParams();
        if (activeOrgId) params.set('org_id', activeOrgId);
        params.set('status', 'all');
        
        const data = await authenticatedFetch(`students?${params}`, {
          signal: abortController.signal,
        });
        setStudents(Array.isArray(data) ? data : []);
      } catch (err) {
        if (err?.name === 'AbortError') return;
        console.error('Failed to load students', err);
      } finally {
        setLoadingStudents(false);
      }
    };

    void loadStudents();

    return () => {
      abortController.abort();
    };
  }, [open, mode, activeOrgId]);

  // Load instructors and services for create mode
  useEffect(() => {
    if (!open || mode !== 'create' || !activeOrgId) {
      setInstructors([]);
      setServices([]);
      return;
    }

    const abortController = new AbortController();
    setLoadingInstructors(true);
    setLoadingServices(true);

    const loadInstructors = async () => {
      try {
        const params = new URLSearchParams();
        if (activeOrgId) params.set('org_id', activeOrgId);
        
        const data = await authenticatedFetch(`instructors?${params}`, {
          signal: abortController.signal,
        });
        setInstructors(Array.isArray(data) ? data : []);
      } catch (err) {
        if (err?.name === 'AbortError') return;
        console.error('Failed to load instructors', err);
      } finally {
        setLoadingInstructors(false);
      }
    };

    const loadServices = async () => {
      try {
        const params = new URLSearchParams({ keys: 'available_services' });
        if (activeOrgId) params.set('org_id', activeOrgId);
        
        const payload = await authenticatedFetch(`settings?${params}`, {
          signal: abortController.signal,
        });
        const settingsValue = payload?.settings?.available_services;
        setServices(Array.isArray(settingsValue) ? settingsValue : []);
      } catch (err) {
        if (err?.name === 'AbortError') return;
        console.error('Failed to load services', err);
      } finally {
        setLoadingServices(false);
      }
    };

    void loadInstructors();
    void loadServices();

    return () => {
      abortController.abort();
    };
  }, [open, mode, activeOrgId]);

  // Pre-fill name and service when opening
  useEffect(() => {
    if (open && mode === 'create') {
      setNewStudentName(unassignedName);
      setDefaultService(reportService);
    }
  }, [open, mode, unassignedName, reportService]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setMode('assign');
      setState(REQUEST_STATE.idle);
      setError('');
      setStudentQuery('');
      setSelectedStudentId('');
      setNewStudentName('');
      setNationalId('');
      setInstructorId('');
      setDefaultService('');
    }
  }, [open]);

  const filteredStudents = useMemo(() => {
    const query = studentQuery.trim().toLowerCase();
    if (!query) return students;
    
    return students.filter((s) => {
      const name = String(s?.name || '').toLowerCase();
      const contactName = String(s?.contact_name || '').toLowerCase();
      const contactPhone = String(s?.contact_phone || '').toLowerCase();
      
      return name.includes(query) || contactName.includes(query) || contactPhone.includes(query);
    });
  }, [students, studentQuery]);

  const handleAssignExisting = async () => {
    if (!selectedStudentId) {
      setError('נא לבחור תלמיד.');
      return;
    }

    setState(REQUEST_STATE.loading);
    setError('');

    try {
      await assignLooseSession({
        sessionId: report.id,
        studentId: selectedStudentId,
        orgId: activeOrgId,
      });
      
      setState(REQUEST_STATE.idle);
      onResolved?.();
    } catch (err) {
      console.error('Failed to assign loose session', err);
      setState(REQUEST_STATE.error);
      
      const serverMessage = err?.data?.message || err?.message || '';
      let friendly = 'שיוך הדיווח נכשל.';
      
      if (serverMessage === 'student_not_found') {
        friendly = 'התלמיד לא נמצא במערכת.';
      } else if (serverMessage === 'session_already_assigned') {
        friendly = 'הדיווח כבר משויך לתלמיד.';
      } else if (serverMessage === 'session_not_found') {
        friendly = 'הדיווח לא נמצא במערכת.';
      }
      
      setError(friendly);
    }
  };

  const handleCreateAndAssign = async () => {
    if (!newStudentName.trim()) {
      setError('נא למלא שם תלמיד.');
      return;
    }
    
    if (!nationalId || !nationalId.trim()) {
      setError('נא למלא מספר זהות.');
      return;
    }
    
    if (!instructorId) {
      setError('נא לבחור מדריך.');
      return;
    }

    if (!defaultService || !defaultService.trim()) {
      setError('נא למלא שירות דיווח.');
      return;
    }

    setState(REQUEST_STATE.loading);
    setError('');

    try {
      await createAndAssignLooseSession({
        sessionId: report.id,
        name: newStudentName.trim(),
        nationalId: nationalId.trim(),
        assignedInstructorId: instructorId,
        defaultService: defaultService.trim(),
        orgId: activeOrgId,
      });
      
      setState(REQUEST_STATE.idle);
      toast.success('תלמיד חדש נוצר והדיווח שוייך בהצלחה.');
      onResolved?.();
    } catch (err) {
      console.error('Failed to create and assign loose session', err);
      setState(REQUEST_STATE.error);
      
      const serverMessage = err?.data?.message || err?.message || '';
      let friendly = 'יצירת התלמיד ושיוך הדיווח נכשלו.';
      
      if (serverMessage === 'instructor_not_found') {
        friendly = 'המדריך לא נמצא במערכת.';
      } else if (serverMessage === 'instructor_inactive') {
        friendly = 'המדריך אינו פעיל. נא לבחור מדריך פעיל.';
      } else if (serverMessage === 'session_already_assigned') {
        friendly = 'הדיווח כבר משויך לתלמיד.';
      } else if (serverMessage === 'duplicate_national_id') {
        friendly = 'מספר זהות כבר קיים במערכת. נא לבחור תלמיד קיים או להזין מספר זהות אחר.';
      }
      
      setError(friendly);
    }
  };

  const isSubmitting = state === REQUEST_STATE.loading;
  const showLoading = loadingStudents || loadingInstructors || loadingServices;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose?.(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>שיוך דיווח ממתין</DialogTitle>
        </DialogHeader>

        <div className="space-y-4" dir="rtl">
          <div className="rounded-lg bg-neutral-50 p-3 text-sm">
            <p className="font-medium text-foreground">פרטי הדיווח:</p>
            <p className="text-neutral-600 mt-1">שם: {unassignedName}</p>
            {reportService && <p className="text-neutral-600">שירות: {reportService}</p>}
          </div>

          <div className="flex gap-2">
            <Button
              variant={mode === 'assign' ? 'default' : 'outline'}
              onClick={() => setMode('assign')}
              disabled={isSubmitting}
              className="flex-1 gap-2"
            >
              <UserCheck className="h-4 w-4" />
              שיוך לתלמיד קיים
            </Button>
            <Button
              variant={mode === 'create' ? 'default' : 'outline'}
              onClick={() => setMode('create')}
              disabled={isSubmitting}
              className="flex-1 gap-2"
            >
              <UserPlus className="h-4 w-4" />
              יצירת תלמיד חדש
            </Button>
          </div>

          {showLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-neutral-600">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>טוען נתונים...</span>
            </div>
          ) : mode === 'assign' ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="student-search" className="block text-right">חיפוש תלמיד</Label>
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                  <Input
                    id="student-search"
                    placeholder="חפשו לפי שם, איש קשר או טלפון..."
                    value={studentQuery}
                    onChange={(e) => setStudentQuery(e.target.value)}
                    disabled={isSubmitting}
                    className="pr-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="student-select" className="block text-right">בחרו תלמיד *</Label>
                <Select
                  value={selectedStudentId}
                  onValueChange={setSelectedStudentId}
                  disabled={isSubmitting || filteredStudents.length === 0}
                >
                  <SelectTrigger id="student-select" className="w-full">
                    <SelectValue placeholder="בחרו תלמיד מהרשימה" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {filteredStudents.map((student) => (
                      <SelectItem key={student.id} value={student.id}>
                        {student.name || 'ללא שם'}
                        {student.contact_name ? ` (${student.contact_name})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {filteredStudents.length === 0 && (
                  <p className="text-xs text-neutral-500 text-right">
                    לא נמצאו תלמידים. נסו חיפוש אחר או צרו תלמיד חדש.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-student-name" className="block text-right">שם התלמיד *</Label>
                <Input
                  id="new-student-name"
                  value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                  disabled={isSubmitting}
                  placeholder="הקלידו שם מלא"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="national-id" className="block text-right">מספר זהות *</Label>
                <Input
                  id="national-id"
                  value={nationalId}
                  onChange={(e) => setNationalId(e.target.value)}
                  disabled={isSubmitting}
                  placeholder="הקלידו מספר זהות"
                  maxLength={9}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="instructor-select" className="block text-right">בחרו מדריך *</Label>
                <Select
                  value={instructorId}
                  onValueChange={setInstructorId}
                  disabled={isSubmitting || instructors.length === 0}
                >
                  <SelectTrigger id="instructor-select" className="w-full">
                    <SelectValue placeholder="בחרו מדריך" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {instructors.map((instructor) => (
                      <SelectItem key={instructor.id} value={instructor.id}>
                        {instructor.name || instructor.email || instructor.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {instructors.length === 0 && (
                  <p className="text-xs text-neutral-500 text-right">
                    אין מדריכים זמינים. נא להוסיף מדריך תחילה.
                  </p>
                )}
              </div>

              <ComboBoxField
                id="default-service"
                name="default_service"
                label="שירות דיווח *"
                value={defaultService}
                onChange={setDefaultService}
                options={services}
                placeholder="בחרו מהרשימה או הקלידו שירות"
                disabled={isSubmitting}
                dir="rtl"
                emptyMessage="לא נמצאו שירותים תואמים"
                description="השירות שתועד במפגש זה. יוצע כברירת מחדל בדיווחים עתידיים."
                required
              />
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 text-right">
              {error}
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row-reverse sm:justify-end pt-4 border-t">
            <Button
              onClick={mode === 'assign' ? handleAssignExisting : handleCreateAndAssign}
              disabled={isSubmitting || showLoading}
              className="gap-2"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {mode === 'assign' ? 'שיוך קיים' : 'יצירה ושיוך'}
            </Button>
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              ביטול
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
