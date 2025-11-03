import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, Loader2, Pencil, Search, X, User, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { useOrg } from '@/org/OrgContext.jsx';
import { useSupabase } from '@/context/SupabaseContext.jsx';
import { authenticatedFetch } from '@/lib/api-client.js';
import AddStudentForm, { AddStudentFormFooter } from '../components/AddStudentForm.jsx';
// Removed legacy instructor assignment modal; instructor is edited inside EditStudent now
import EditStudentModal from '../components/EditStudentModal.jsx';
import PageLayout from '@/components/ui/PageLayout.jsx';
import { includesDayQuery } from '@/features/students/utils/schedule.js';
import DayOfWeekSelect from '@/components/ui/DayOfWeekSelect.jsx';

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
  // const [studentForAssignment, setStudentForAssignment] = useState(null);
  const [studentForEdit, setStudentForEdit] = useState(null);
  const [isUpdatingStudent, setIsUpdatingStudent] = useState(false);
  const [updateError, setUpdateError] = useState('');
  const [filterMode, setFilterMode] = useState('all'); // 'mine' | 'all'
  const [searchQuery, setSearchQuery] = useState('');
  const [dayFilter, setDayFilter] = useState(null);
  const [instructorFilterId, setInstructorFilterId] = useState('');

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

  // Ensure instructor-specific filter is cleared when viewing "my students"
  useEffect(() => {
    if (filterMode === 'mine' && instructorFilterId) {
      setInstructorFilterId('');
    }
  }, [filterMode, instructorFilterId]);

  // Combined filter options for the control: mine, all, and per-instructor
  const combinedFilterOptions = useMemo(() => {
    const base = [
      { value: 'mine', label: 'התלמידים שלי' },
      { value: 'all', label: 'כל התלמידים' },
    ];
    if (!Array.isArray(instructors) || instructors.length === 0) return base;
    const instructorOptions = instructors.map((inst) => ({
      value: `inst:${inst.id}`,
      label: `התלמידים של ${inst.name || inst.email || inst.id}`,
    }));
    return base.concat(instructorOptions);
  }, [instructors]);

  const combinedFilterValue = useMemo(() => {
    if (instructorFilterId) return `inst:${instructorFilterId}`;
    return filterMode; // 'mine' or 'all'
  }, [filterMode, instructorFilterId]);

  const handleCombinedFilterChange = (e) => {
    const value = e.target.value;
    if (value === 'mine') {
      setFilterMode('mine');
      setInstructorFilterId('');
      return;
    }
    if (value === 'all') {
      setFilterMode('all');
      setInstructorFilterId('');
      return;
    }
    if (value.startsWith('inst:')) {
      const id = value.slice(5);
      setFilterMode('all');
      setInstructorFilterId(id);
    }
  };

  const handleResetFilters = () => {
    setFilterMode('all');
    setInstructorFilterId('');
    setSearchQuery('');
    setDayFilter(null);
  };

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return searchQuery.trim() !== '' || dayFilter !== null || instructorFilterId !== '' || filterMode !== 'all';
  }, [searchQuery, dayFilter, instructorFilterId, filterMode]);

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

  // Legacy assignment handlers removed in favor of unified edit flow

  const handleOpenEdit = (student) => {
    setUpdateError('');
    setStudentForEdit(student);
  };

  const handleCloseEdit = () => {
    if (!isUpdatingStudent) {
      setStudentForEdit(null);
      setUpdateError('');
    }
  };

  const handleUpdateStudent = async (payload) => {
    if (!payload?.id) return;
    setIsUpdatingStudent(true);
    setUpdateError('');
    try {
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
        tags: payload.tags,
      };
      await authenticatedFetch(`students/${payload.id}`, { session, method: 'PUT', body });
      setStudentForEdit(null);
      await refreshRoster(true);
    } catch (error) {
      console.error('Failed to update student', error);
      setUpdateError(error?.message || 'עדכון התלמיד נכשל.');
    } finally {
      setIsUpdatingStudent(false);
    }
  };

  // Compute filtered/sorted students before any early returns to satisfy hooks rules
  const displayedStudents = useMemo(() => {
    let filtered = students;

    // Filter by instructor (explicit instructor takes precedence over mode)
    if (instructorFilterId) {
      filtered = filtered.filter((s) => s.assigned_instructor_id === instructorFilterId);
    } else if (filterMode === 'mine' && user?.id) {
      filtered = filtered.filter((s) => s.assigned_instructor_id === user.id);
    }
    // Filter by day of week if selected
    if (dayFilter) {
      filtered = filtered.filter((s) => Number(s?.default_day_of_week) === Number(dayFilter));
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((student) => {
        try {
          // Search by student name
          const studentName = String(student.name || '').toLowerCase();
          if (studentName.includes(query)) return true;

          // Search by parent/contact name
          const contactName = String(student.contact_name || '').toLowerCase();
          if (contactName.includes(query)) return true;

          // Search by phone number
          const contactPhone = String(student.contact_phone || '').toLowerCase();
          if (contactPhone.includes(query)) return true;

          // Search by default day of week (Hebrew label)
          if (includesDayQuery(student.default_day_of_week, query)) return true;

          // Search by default session time
          const sessionTime = String(student.default_session_time || '').toLowerCase();
          if (sessionTime.includes(query)) return true;

          return false;
        } catch (error) {
          console.error('Error filtering student:', student, error);
          return false;
        }
      });
    }

    return filtered;
  }, [students, filterMode, user?.id, searchQuery, dayFilter, instructorFilterId]);

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

  return (
    <PageLayout
      title="ניהול תלמידים"
      actions={(
        <div className="flex items-center gap-3 self-start">
          <div className="flex items-center gap-2 text-sm">
            <label htmlFor="students-filter-combined" className="text-neutral-600">הצג:</label>
            <select
              id="students-filter-combined"
              className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm text-foreground"
              value={combinedFilterValue}
              onChange={handleCombinedFilterChange}
            >
              {combinedFilterOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
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
          <div className="flex flex-col gap-sm sm:flex-row sm:items-center">
            {instructorsState === REQUEST_STATES.loading ? (
              <p className="flex items-center gap-xs text-sm text-neutral-600">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                טוען רשימת מדריכים...
              </p>
            ) : null}
            <div className="relative w-full sm:w-64">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden="true" />
              <Input
                type="text"
                placeholder="חיפוש לפי שם, הורה, יום או שעה..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pr-10 text-sm"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                  aria-label="נקה חיפוש"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <div className="sm:w-56">
              <DayOfWeekSelect
                value={dayFilter}
                onChange={setDayFilter}
                placeholder="סינון לפי יום"
              />
            </div>
            {hasActiveFilters && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResetFilters}
                className="gap-xs"
                title="נקה כל המסננים"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">נקה מסננים</span>
              </Button>
            )}
          </div>
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
              {searchQuery ? 'לא נמצאו תלמידים התואמים את החיפוש.' : 'עדיין לא נוספו תלמידים לארגון זה.'}
            </div>
          ) : null}

          {!isLoadingStudents && !studentsError && !isEmpty && displayedStudents.length === 0 ? (
            <div className="py-xl text-center text-sm text-neutral-500">
              לא נמצאו תלמידים התואמים את המסננים/החיפוש.
            </div>
          ) : null}

          {!isLoadingStudents && !studentsError && displayedStudents.length > 0 ? (
            <>
              {searchQuery && (
                <div className="mb-sm text-xs text-neutral-600">
                  נמצאו {displayedStudents.length} תלמידים
                </div>
              )}
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
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
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
                                    onClick={() => handleOpenEdit(student)}
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
                          </div>
                          {contactDisplay !== '—' && (
                            <Popover>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  className="sm:hidden rounded-full p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
                                  aria-label="הצג פרטי קשר"
                                >
                                  <User className="h-4 w-4" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-64 text-sm" align="end">
                                <div className="space-y-1">
                                  <div className="font-semibold text-neutral-900">פרטי קשר</div>
                                  {contactName && (
                                    <div>
                                      <span className="text-xs text-neutral-500">שם: </span>
                                      <span className="text-neutral-700">{contactName}</span>
                                    </div>
                                  )}
                                  {contactPhone && (
                                    <div>
                                      <span className="text-xs text-neutral-500">טלפון: </span>
                                      <a href={`tel:${contactPhone}`} className="text-primary hover:underline">
                                        {contactPhone}
                                      </a>
                                    </div>
                                  )}
                                </div>
                              </PopoverContent>
                            </Popover>
                          )}
                        </div>
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
                          onClick={() => handleOpenEdit(student)}
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
            </>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={isAddDialogOpen} onOpenChange={(open) => { if (!open) handleCloseAddDialog(); }}>
        <DialogContent 
          className="sm:max-w-xl" 
          footer={
            <AddStudentFormFooter
              onSubmit={() => document.getElementById('add-student-form')?.requestSubmit()}
              onCancel={handleCloseAddDialog}
              isSubmitting={isCreatingStudent}
            />
          }
        >
          <DialogHeader>
            <DialogTitle>הוספת תלמיד חדש</DialogTitle>
          </DialogHeader>
          <AddStudentForm
            onSubmit={handleCreateStudent}
            onCancel={handleCloseAddDialog}
            isSubmitting={isCreatingStudent}
            error={createError}
            renderFooterOutside={true}
          />
        </DialogContent>
      </Dialog>

      {/* Instructor assignment is now handled inside EditStudentModal */}

      <EditStudentModal
        open={Boolean(studentForEdit)}
        onClose={handleCloseEdit}
        student={studentForEdit}
        onSubmit={handleUpdateStudent}
        isSubmitting={isUpdatingStudent}
        error={updateError}
      />
    </PageLayout>
  );
}
