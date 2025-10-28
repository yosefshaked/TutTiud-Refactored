import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { authenticatedFetch } from '@/lib/api-client.js';
import { toast } from 'sonner';

function normalizeStudent(student) {
  if (!student || typeof student !== 'object') {
    return null;
  }
  return student;
}

export default function AssignInstructorModal({ open, onClose, student, orgId, session, onAssigned }) {
  const normalizedStudent = useMemo(() => normalizeStudent(student), [student]);
  const [instructors, setInstructors] = useState([]);
  const [loadingState, setLoadingState] = useState('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedInstructorId, setSelectedInstructorId] = useState('');
  const [saveState, setSaveState] = useState('idle');

  useEffect(() => {
    if (normalizedStudent?.assigned_instructor_id) {
      setSelectedInstructorId(normalizedStudent.assigned_instructor_id);
    } else {
      setSelectedInstructorId('');
    }
  }, [normalizedStudent?.assigned_instructor_id]);

  const loadInstructors = useCallback(async () => {
    if (!open || !normalizedStudent || !orgId) {
      return;
    }

    setLoadingState('loading');
    setErrorMessage('');

    try {
      const searchParams = new URLSearchParams({ org_id: orgId });
      const payload = await authenticatedFetch(`instructors?${searchParams.toString()}`, { session });
      setInstructors(Array.isArray(payload) ? payload : []);
    } catch (error) {
      console.error('Failed to load instructors', error);
      setErrorMessage(error?.message || 'טעינת רשימת המדריכים נכשלה.');
      toast.error('טעינת רשימת המדריכים נכשלה.');
      setInstructors([]);
    } finally {
      setLoadingState('idle');
    }
  }, [open, normalizedStudent, orgId, session]);

  useEffect(() => {
    if (open) {
      loadInstructors();
    } else {
      setInstructors([]);
      setErrorMessage('');
      setSelectedInstructorId('');
    }
  }, [open, loadInstructors]);

  const handleSelectionChange = (event) => {
    setSelectedInstructorId(event.target.value);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!normalizedStudent || !orgId) {
      return;
    }

    setSaveState('saving');
    setErrorMessage('');

    try {
      const body = {
        org_id: orgId,
        assigned_instructor_id: selectedInstructorId ? selectedInstructorId : null,
      };
      const updated = await authenticatedFetch(`students/${normalizedStudent.id}`, {
        session,
        method: 'PUT',
        body,
      });
      toast.success('המדריך עודכן בהצלחה.');
      if (typeof onAssigned === 'function') {
        onAssigned(updated);
      }
      onClose();
    } catch (error) {
      console.error('Failed to assign instructor', error);
      setErrorMessage(error?.message || 'עדכון המדריך נכשל.');
      toast.error('עדכון המדריך נכשל.');
    } finally {
      setSaveState('idle');
    }
  };

  const isLoading = loadingState === 'loading';
  const isSaving = saveState === 'saving';

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto pb-28 sm:pb-6">
        <DialogHeader>
          <DialogTitle>שיוך מדריך</DialogTitle>
          <DialogDescription>
            בחרו מדריך עבור התלמיד {normalizedStudent?.name || ''}. ניתן להשאיר ללא שיוך במידת הצורך.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="assign-instructor-select">מדריך משויך</Label>
            <select
              id="assign-instructor-select"
              className="w-full rounded-md border border-slate-200 bg-white p-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={selectedInstructorId}
              onChange={handleSelectionChange}
              disabled={isLoading || isSaving}
            >
              <option value="">ללא מדריך</option>
              {instructors.map((instructor) => (
                <option key={instructor.id} value={instructor.id}>
                  {instructor.name || instructor.id}
                </option>
              ))}
            </select>
            {isLoading ? (
              <p className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                טוען רשימת מדריכים...
              </p>
            ) : null}
          </div>

          {errorMessage ? (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
              {errorMessage}
            </div>
          ) : null}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
              ביטול
            </Button>
            <Button type="submit" disabled={isSaving} className="gap-2">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              שמירת שיוך
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
