import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { useOrg } from '@/org/OrgContext.jsx';
import { useSupabase } from '@/context/SupabaseContext.jsx';
import { authenticatedFetch } from '@/lib/api-client.js';
import AddStudentForm from '../components/AddStudentForm.jsx';
import AssignInstructorModal from '../components/AssignInstructorModal.jsx';
import PageLayout from '@/components/ui/PageLayout.jsx';

const REQUEST_STATES = {
  idle: 'idle',
  loading: 'loading',
  error: 'error',
};

export default function StudentManagementPage() {
  const { activeOrg, activeOrgId, activeOrgHasConnection, tenantClientReady } = useOrg();
  const { session, user, loading: supabaseLoading } = useSupabase();
  const [students, setStudents] = useState([]);
  const [studentsState, setStudentsState] = useState(REQUEST_STATES.idle);
  const [studentsError, setStudentsError] = useState('');
  const [instructors, setInstructors] = useState([]);
  const [instructorsState, setInstructorsState] = useState(REQUEST_STATES.idle);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isCreatingStudent, setIsCreatingStudent] = useState(false);
  const [createError, setCreateError] = useState('');
  const [studentForAssignment, setStudentForAssignment] = useState(null);
  const [filterMode, setFilterMode] = useState('all'); // 'mine' | 'all'

  const instructorMap = useMemo(() => {
    return instructors.reduce((map, instructor) => {
      if (instructor?.id) {
        map.set(instructor.id, instructor);
      }
      return map;
    }, new Map());
  }, [instructors]);

  const canFetch = Boolean(
    session &&
      activeOrgId &&
      tenantClientReady &&
      activeOrgHasConnection,
  );

  const fetchStudents = useCallback(async () => {
    if (!canFetch) {
      return;
    }

    setStudentsState(REQUEST_STATES.loading);
    setStudentsError('');

    try {
      const searchParams = new URLSearchParams({ org_id: activeOrgId });
      const payload = await authenticatedFetch(`students?${searchParams.toString()}`, { session });
      setStudents(Array.isArray(payload) ? payload : []);
    } catch (error) {
      console.error('Failed to load students', error);
      setStudentsError(error?.message || 'טעינת רשימת התלמידים נכשלה.');
      toast.error('טעינת רשימת התלמידים נכשלה.');
      setStudents([]);
      setStudentsState(REQUEST_STATES.error);
      return;
    }

    setStudentsState(REQUEST_STATES.idle);
  }, [canFetch, activeOrgId, session]);

  const fetchInstructors = useCallback(async () => {
    if (!canFetch) {
      return;
    }

    setInstructorsState(REQUEST_STATES.loading);

    try {
      const searchParams = new URLSearchParams({ org_id: activeOrgId });
      const payload = await authenticatedFetch(`instructors?${searchParams.toString()}`, { session });
      setInstructors(Array.isArray(payload) ? payload : []);
    } catch (error) {
      console.error('Failed to load instructors', error);
      toast.error('טעינת רשימת המדריכים נכשלה.');
      setInstructors([]);
      setInstructorsState(REQUEST_STATES.error);
      return;
    }

    setInstructorsState(REQUEST_STATES.idle);
  }, [canFetch, activeOrgId, session]);

  const refreshRoster = useCallback(async (includeInstructors = false) => {
    await fetchStudents();
    if (includeInstructors) {
      await fetchInstructors();
    }
  }, [fetchStudents, fetchInstructors]);

  useEffect(() => {
    if (canFetch) {
      refreshRoster(true);
    } else {
      setStudents([]);
      setInstructors([]);
    }
  }, [canFetch, refreshRoster]);

  // Default the view for admins/owners who are also instructors to "mine"
  useEffect(() => {
    if (!user || !Array.isArray(instructors) || instructors.length === 0) return;
    const isInstructor = instructors.some((i) => i?.id === user.id);
    if (isInstructor) {
      setFilterMode((prev) => (prev === 'all' ? 'mine' : prev));
    }
  }, [user, instructors]);

  const handleOpenAddDialog = () => {
    setCreateError('');
    setIsAddDialogOpen(true);
  };

  const handleCloseAddDialog = () => {
    if (!isCreatingStudent) {
      setIsAddDialogOpen(false);
      setCreateError('');
    }
  };

  const handleCreateStudent = async ({
    name,
    contactName,
    contactPhone,
    assignedInstructorId,
    defaultService,
    defaultDayOfWeek,
    defaultSessionTime,
    notes,
    tags,
  }) => {
    if (!canFetch) {
      return;
    }

    setIsCreatingStudent(true);
    setCreateError('');

    try {
      const body = {
        org_id: activeOrgId,
        name,
        contact_name: contactName,
        contact_phone: contactPhone,
        assigned_instructor_id: assignedInstructorId,
        default_service: defaultService,
        default_day_of_week: defaultDayOfWeek,
        default_session_time: defaultSessionTime,
        notes,
        tags,
      };
      await authenticatedFetch('students', {
        session,
        method: 'POST',
        body,
      });
      toast.success('התלמיד נוסף בהצלחה.');
      setIsAddDialogOpen(false);
      await refreshRoster();
    } catch (error) {
      console.error('Failed to create student', error);
      setCreateError(error?.message || 'יצירת התלמיד נכשלה.');
      toast.error('יצירת התלמיד נכשלה.');
    } finally {
      setIsCreatingStudent(false);
    }
  };

  const handleOpenAssignment = (student) => {
    setStudentForAssignment(student);
  };

  const handleCloseAssignment = () => {
    setStudentForAssignment(null);
  };

  const handleAssignmentSuccess = async () => {
    await refreshRoster();
  };

  if (supabaseLoading) {
    return (
      <div className="p-6 text-center text-neutral-600">
        טוען חיבור...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6 text-center text-neutral-600">
        יש להתחבר כדי להציג את רשימת התלמידים.
      </div>
    );
  }

  if (!activeOrgHasConnection || !activeOrg) {
    return (
      <div className="p-6 text-center text-neutral-600">
        בחרו ארגון עם חיבור פעיל כדי לנהל תלמידים.
      </div>
    );
  }

  const isLoadingStudents = studentsState === REQUEST_STATES.loading;
  const isEmpty = !isLoadingStudents && students.length === 0 && !studentsError;

  const displayedStudents = React.useMemo(() => {
    if (filterMode === 'mine' && user?.id) {
      return students.filter((s) => s.assigned_instructor_id === user.id);
    }
    return students;
  }, [students, filterMode, user?.id]);

  return (
    <PageLayout
      title="ניהול תלמידים"
      actions={(
        <div className="flex items-center gap-3 self-start">
          <div className="flex items-center gap-2 text-sm">
            <label htmlFor="students-filter" className="text-neutral-600">הצג:</label>
            <select
              id="students-filter"
              className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm text-foreground"
              value={filterMode}
              onChange={(e) => setFilterMode(e.target.value)}
            >
              <option value="mine">התלמידים שלי</option>
              <option value="all">כל התלמידים</option>
            </select>
          </div>
          <Button type="button" className="gap-sm" onClick={handleOpenAddDialog}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            תלמיד חדש
          </Button>
        </div>
      )}
    >

      <Card className="w-full">
        <CardHeader className="flex flex-col gap-sm sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base font-semibold text-foreground">רשימת תלמידים</CardTitle>
          {instructorsState === REQUEST_STATES.loading ? (
            <p className="flex items-center gap-xs text-sm text-neutral-600">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              טוען רשימת מדריכים...
            </p>
          ) : null}
        </CardHeader>
        <CardContent>
          {isLoadingStudents ? (
            <div className="flex items-center justify-center gap-sm py-xl text-neutral-600">
              <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
              <span className="text-sm">טוען תלמידים...</span>
            </div>
          ) : null}

          {studentsError && !isLoadingStudents ? (
            <div className="rounded-lg bg-error/10 p-md text-sm text-error" role="alert">
              {studentsError}
            </div>
          ) : null}

          {isEmpty ? (
            <div className="py-xl text-center text-sm text-neutral-500">
              עדיין לא נוספו תלמידים לארגון זה.
            </div>
          ) : null}

          {!isLoadingStudents && !studentsError && displayedStudents.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right text-sm font-medium text-neutral-600">שם התלמיד</TableHead>
                  <TableHead className="hidden text-right text-sm font-medium text-neutral-600 sm:table-cell">פרטי קשר</TableHead>
                  <TableHead className="w-[100px] text-right text-sm font-medium text-neutral-600">פעולות</TableHead>
                </TableRow>
              </TableHeader>
            <TableBody>
                {displayedStudents.map((student) => {
                  const instructor = instructorMap.get(student.assigned_instructor_id) || null;
                  const contactName = student.contact_name || '';
                  const contactPhone = student.contact_phone || '';
                  const contactDisplay = [contactName, contactPhone].filter(Boolean).join(' · ') || '—';
                  
                  return (
                    <TableRow key={student.id}>
                      <TableCell className="text-sm font-semibold text-foreground">
                        {student.id ? (
                          <Link to={`/students/${student.id}`} className="text-primary hover:underline">
                            {student.name || 'ללא שם'}
                          </Link>
                        ) : (
                          student.name || 'ללא שם'
                        )}
                        {filterMode === 'all' ? (
                          <div className="mt-0.5 text-xs text-neutral-500">
                            {instructor?.name ? (
                              <>מדריך: {instructor.name}</>
                            ) : student.assigned_instructor_id ? (
                              <button
                                type="button"
                                onClick={() => handleOpenAssignment(student)}
                                className="text-amber-700 underline underline-offset-2 hover:text-amber-800"
                                title="שיוך מדריך מחדש"
                              >
                                המדריך הושבת — יש לשייך מדריך חדש
                              </button>
                            ) : (
                              <>ללא מדריך</>
                            )}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="hidden text-sm text-neutral-600 sm:table-cell">
                        {contactDisplay}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-xs text-xs sm:text-sm"
                          onClick={() => handleOpenAssignment(student)}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                          <span className="hidden sm:inline">עריכה</span>
                          <span className="sm:hidden">✎</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={isAddDialogOpen} onOpenChange={(open) => { if (!open) handleCloseAddDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>הוספת תלמיד חדש</DialogTitle>
          </DialogHeader>
          <AddStudentForm
            onSubmit={handleCreateStudent}
            onCancel={handleCloseAddDialog}
            isSubmitting={isCreatingStudent}
            error={createError}
          />
        </DialogContent>
      </Dialog>

      <AssignInstructorModal
        open={Boolean(studentForAssignment)}
        onClose={handleCloseAssignment}
        student={studentForAssignment}
        orgId={activeOrgId}
        session={session}
        onAssigned={handleAssignmentSuccess}
      />
    </PageLayout>
  );
}
