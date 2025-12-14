import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Users, UserPlus } from 'lucide-react';
import { useOrg } from '@/org/OrgContext.jsx';
import { useStudents } from '@/hooks/useOrgData.js';
import { assignLooseSession, createAndAssignLooseSession } from '@/features/sessions/api/loose-sessions.js';
import { mapLooseSessionError } from '@/lib/error-mapping.js';
import AddStudentForm from '@/features/admin/components/AddStudentForm.jsx';
import ComboBoxInput from '@/components/ui/ComboBoxInput.jsx';

const RESOLUTION_MODE = Object.freeze({
  SELECT: 'select',
  ASSIGN_EXISTING: 'assign_existing',
  CREATE_NEW: 'create_new',
});

export default function BulkResolvePendingReportsDialog({ 
  open, 
  onClose, 
  reports = [], 
  onResolved 
}) {
  const { activeOrg } = useOrg();
  const activeOrgId = activeOrg?.id;
  
  const [mode, setMode] = useState(RESOLUTION_MODE.SELECT);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Fetch students for assignment dropdown (admin sees all, non-admin sees only their own)
  const { data: students = [], isLoading: studentsLoading } = useStudents({
    enabled: open && mode === RESOLUTION_MODE.ASSIGN_EXISTING,
    status: 'all',
  });

  const studentOptions = useMemo(() => {
    return students.map((s) => ({
      value: s.id,
      label: s.name,
    }));
  }, [students]);

  const handleClose = () => {
    setMode(RESOLUTION_MODE.SELECT);
    setSelectedStudentId('');
    setStudentSearchQuery('');
    setIsProcessing(false);
    onClose();
  };

  const handleModeSelect = (selectedMode) => {
    setMode(selectedMode);
  };

  const handleAssignExisting = async () => {
    if (!selectedStudentId) {
      toast.error('נא לבחור תלמיד.');
      return;
    }

    setIsProcessing(true);
    let successCount = 0;
    let failCount = 0;

    // Process assignments sequentially
    for (const report of reports) {
      try {
        await assignLooseSession({
          sessionId: report.id,
          studentId: selectedStudentId,
          orgId: activeOrgId,
        });
        successCount++;
      } catch (err) {
        console.error(`Failed to assign session ${report.id}`, err);
        failCount++;
      }
    }

    setIsProcessing(false);

    // Show summary toast
    if (failCount === 0) {
      toast.success(`${successCount} דיווחים שוייכו בהצלחה.`);
      onResolved();
      handleClose();
    } else if (successCount === 0) {
      toast.error(`שיוך ${failCount} דיווחים נכשל.`);
    } else {
      toast.warning(`${successCount} דיווחים שוייכו בהצלחה, ${failCount} נכשלו.`);
      onResolved();
      handleClose();
    }
  };

  const handleCreateAndAssign = async (studentData) => {
    setIsProcessing(true);
    let successCount = 0;
    let failCount = 0;
    let createdStudentId = null;

    // Create student first, then assign all reports to it
    for (const report of reports) {
      try {
        const result = await createAndAssignLooseSession({
          sessionId: report.id,
          name: studentData.name,
          nationalId: studentData.nationalId,
          assignedInstructorId: studentData.assignedInstructorId,
          defaultService: studentData.defaultService || null,
          orgId: activeOrgId,
        });
        
        // Capture the created student ID from first success
        if (!createdStudentId && result?.student_id) {
          createdStudentId = result.student_id;
        }
        
        successCount++;
      } catch (err) {
        console.error(`Failed to create/assign session ${report.id}`, err);
        const errorMessage = mapLooseSessionError(err?.message, 'create');
        if (errorMessage) {
          toast.error(errorMessage);
        }
        failCount++;
      }
    }

    setIsProcessing(false);

    // Show summary toast
    if (failCount === 0) {
      toast.success(`תלמיד חדש נוצר ו-${successCount} דיווחים שוייכו בהצלחה.`);
      onResolved();
      handleClose();
    } else if (successCount === 0) {
      toast.error(`יצירת תלמיד ושיוך ${failCount} דיווחים נכשלו.`);
    } else {
      toast.warning(`${successCount} דיווחים שוייכו בהצלחה, ${failCount} נכשלו.`);
      onResolved();
      handleClose();
    }
  };

  const reportNames = useMemo(() => {
    const names = new Set();
    reports.forEach((r) => {
      const name = r?.metadata?.unassigned_details?.name;
      if (name) names.add(name);
    });
    return Array.from(names);
  }, [reports]);

  const hasMultipleNames = reportNames.length > 1;

  // Extract instructor IDs from reports for auto-assignment
  const suggestedInstructorId = useMemo(() => {
    const instructorIds = new Set();
    reports.forEach((r) => {
      if (r?.instructor_id) {
        instructorIds.add(r.instructor_id);
      }
    });
    
    // If only one instructor, return it for auto-fill
    // If multiple instructors or none, return empty
    if (instructorIds.size === 1) {
      return Array.from(instructorIds)[0];
    }
    return '';
  }, [reports]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right">שיוך מרובה - {reports.length} דיווחים</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Summary */}
          <div className="rounded-lg bg-muted p-3 space-y-2">
            <p className="text-sm font-medium text-right">דיווחים נבחרים:</p>
            <div className="flex flex-wrap gap-2">
              {reportNames.map((name) => (
                <Badge key={name} variant="outline">
                  {name}
                </Badge>
              ))}
            </div>
            {hasMultipleNames && (
              <p className="text-xs text-amber-700 dark:text-amber-400 text-right">
                ⚠️ שים לב: נבחרו דיווחים עם שמות שונים. כל הדיווחים ישוייכו לאותו תלמיד.
              </p>
            )}
          </div>

          {/* Mode Selection */}
          {mode === RESOLUTION_MODE.SELECT && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground text-right">
                בחר פעולה לביצוע עבור כל הדיווחים הנבחרים:
              </p>
              <div className="grid grid-cols-1 gap-3">
                <Button
                  variant="outline"
                  className="h-auto p-4 flex flex-col items-start gap-2"
                  onClick={() => handleModeSelect(RESOLUTION_MODE.ASSIGN_EXISTING)}
                  dir="rtl"
                >
                  <div className="flex items-center gap-2 w-full">
                    <Users className="h-5 w-5" />
                    <span className="font-semibold">שיוך לתלמיד קיים</span>
                  </div>
                  <p className="text-xs text-muted-foreground text-right">
                    שייך את כל הדיווחים לתלמיד אחד מהרשימה
                  </p>
                </Button>

                <Button
                  variant="outline"
                  className="h-auto p-4 flex flex-col items-start gap-2"
                  onClick={() => handleModeSelect(RESOLUTION_MODE.CREATE_NEW)}
                  dir="rtl"
                >
                  <div className="flex items-center gap-2 w-full">
                    <UserPlus className="h-5 w-5" />
                    <span className="font-semibold">יצירת תלמיד חדש</span>
                  </div>
                  <p className="text-xs text-muted-foreground text-right">
                    צור תלמיד חדש ושייך אליו את כל הדיווחים
                  </p>
                </Button>
              </div>
            </div>
          )}

          {/* Assign to Existing Student */}
          {mode === RESOLUTION_MODE.ASSIGN_EXISTING && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="student-select" className="text-right block">
                  בחר תלמיד <span className="text-destructive">*</span>
                </Label>
                <ComboBoxInput
                  id="student-select"
                  value={selectedStudentId}
                  query={studentSearchQuery}
                  onValueChange={setSelectedStudentId}
                  onQueryChange={setStudentSearchQuery}
                  options={studentOptions}
                  placeholder={studentsLoading ? 'טוען תלמידים...' : 'חפש תלמיד...'}
                  emptyMessage="לא נמצאו תלמידים"
                  disabled={studentsLoading || isProcessing}
                />
              </div>

              <div className="flex gap-2 flex-row-reverse">
                <Button
                  onClick={handleAssignExisting}
                  disabled={!selectedStudentId || isProcessing}
                >
                  {isProcessing ? 'משייך...' : `שייך ${reports.length} דיווחים`}
                </Button>
                <Button variant="outline" onClick={() => setMode(RESOLUTION_MODE.SELECT)} disabled={isProcessing}>
                  חזור
                </Button>
              </div>
            </div>
          )}

          {/* Create New Student */}
          {mode === RESOLUTION_MODE.CREATE_NEW && (
            <div className="space-y-4">
              <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 p-3 border border-blue-200 dark:border-blue-900">
                <p className="text-sm text-blue-900 dark:text-blue-200 text-right">
                  תלמיד חדש ייווצר ו-{reports.length} דיווחים ישוייכו אליו.
                </p>
              </div>

              <AddStudentForm
                onSubmit={handleCreateAndAssign}
                onCancel={() => setMode(RESOLUTION_MODE.SELECT)}
                submitLabel={`צור ושייך ${reports.length} דיווחים`}
                submitDisabled={isProcessing}
                renderFooterOutside={false}
                initialValues={suggestedInstructorId ? { assignedInstructorId: suggestedInstructorId } : {}}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
