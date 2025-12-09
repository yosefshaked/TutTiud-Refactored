import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, UserCheck, UserPlus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOrg } from '@/org/OrgContext.jsx';
import { useStudents } from '@/hooks/useOrgData.js';
import { assignLooseSession, createAndAssignLooseSession } from '@/features/sessions/api/loose-sessions.js';
import AddStudentForm from '@/features/admin/components/AddStudentForm.jsx';
import { mapLooseSessionError } from '@/lib/error-mapping.js';

const REQUEST_STATE = Object.freeze({
  idle: 'idle',
  loading: 'loading',
  error: 'error',
});

export default function ResolvePendingReportDialog({ open, onClose, report, onResolved }) {
  const { activeOrg } = useOrg();
  const activeOrgId = activeOrg?.id || null;
  const [mode, setMode] = useState('assign'); // 'assign' | 'create'
  const [state, setState] = useState(REQUEST_STATE.idle);
  const [error, setError] = useState('');
  
  // Assign existing mode
  const [studentQuery, setStudentQuery] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const { students, loadingStudents } = useStudents({
    status: 'all',
    enabled: open && mode === 'assign' && Boolean(activeOrgId),
    orgId: activeOrgId,
  });
  const unassignedName = report?.metadata?.unassigned_details?.name || '';
  const reportService = report?.service_context || '';
  const createInitialValues = useMemo(() => ({
    name: unassignedName || '',
    defaultService: reportService || '',
  }), [unassignedName, reportService]);

  // Data loading handled by shared hooks above based on open/mode/org

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setMode('assign');
      setState(REQUEST_STATE.idle);
      setError('');
      setStudentQuery('');
      setSelectedStudentId('');
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
      const friendly = mapLooseSessionError(serverMessage, 'assign', 'שיוך הדיווח נכשל.');
      setError(friendly);
    }
  };

  const handleCreateAndAssign = async (studentPayload) => {
    setState(REQUEST_STATE.loading);
    setError('');

    try {
      await createAndAssignLooseSession({
        sessionId: report.id,
        name: studentPayload.name,
        nationalId: studentPayload.nationalId,
        assignedInstructorId: studentPayload.assignedInstructorId,
        defaultService: studentPayload.defaultService,
        orgId: activeOrgId,
      });

      setState(REQUEST_STATE.idle);
      toast.success('תלמיד חדש נוצר והדיווח שוייך בהצלחה.');
      onResolved?.();
      onClose?.();
    } catch (err) {
      console.error('Failed to create and assign loose session', err);
      setState(REQUEST_STATE.error);

      const serverMessage = err?.data?.message || err?.message || '';
      const friendly = mapLooseSessionError(serverMessage, 'create', 'יצירת התלמיד ושיוך הדיווח נכשלו.');
      setError(friendly);
    } finally {
      setState(REQUEST_STATE.idle);
    }
  };

  const isSubmitting = state === REQUEST_STATE.loading;
  const showLoading = loadingStudents;

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

              {error && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 text-right">
                  {error}
                </div>
              )}

              <div className="flex flex-col-reverse gap-2 sm:flex-row-reverse sm:justify-end pt-4 border-t">
                <Button
                  onClick={handleAssignExisting}
                  disabled={isSubmitting || showLoading}
                  className="gap-2"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  שיוך קיים
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
          ) : (
            <AddStudentForm
              onSubmit={handleCreateAndAssign}
              onCancel={onClose}
              isSubmitting={isSubmitting}
              error={error}
              initialValues={createInitialValues}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
