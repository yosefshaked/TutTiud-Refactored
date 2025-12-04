import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Loader2, Pencil, X, User, FileWarning } from 'lucide-react';
import { toast } from 'sonner';
import { useOrg } from '@/org/OrgContext.jsx';
import { useSupabase } from '@/context/SupabaseContext.jsx';
import { authenticatedFetch } from '@/lib/api-client.js';
import AddStudentForm, { AddStudentFormFooter } from '../components/AddStudentForm.jsx';
import EditStudentModal from '../components/EditStudentModal.jsx';
import DataMaintenanceModal from '../components/DataMaintenanceModal.jsx';
import { DataMaintenanceMenu } from '../components/DataMaintenanceMenu.jsx';
import { StudentFilterSection } from '@/features/students/components/StudentFilterSection.jsx';
import PageLayout from '@/components/ui/PageLayout.jsx';
import { DAY_NAMES, formatDefaultTime } from '@/features/students/utils/schedule.js';
import DayOfWeekSelect from '@/components/ui/DayOfWeekSelect.jsx';
import { normalizeTagIdsForWrite } from '@/features/students/utils/tags.js';
import { useStudentTags } from '@/features/students/hooks/useStudentTags.js';
import { getStudentComparator, STUDENT_SORT_OPTIONS } from '@/features/students/utils/sorting.js';
import { saveFilterState, loadFilterState } from '@/features/students/utils/filter-state.js';
import { normalizeMembershipRole, isAdminRole } from '@/features/students/utils/endpoints.js';

const REQUEST_STATES = {
  idle: 'idle',
  loading: 'loading',
  error: 'error',
};

export default function StudentManagementPage() {
  const { activeOrg, activeOrgId, activeOrgHasConnection, tenantClientReady } = useOrg();
  const { session, user, loading: supabaseLoading } = useSupabase();

  // All hooks must be called before any conditional returns
  const { tagOptions, loadTags } = useStudentTags();
  const [students, setStudents] = useState([]);
  const [studentsState, setStudentsState] = useState(REQUEST_STATES.idle);
  const [studentsError, setStudentsError] = useState('');
  const [complianceSummary, setComplianceSummary] = useState({}); // Map of student_id -> { expiredDocuments: number }
  const [instructors, setInstructors] = useState([]);
  const [instructorsState, setInstructorsState] = useState(REQUEST_STATES.idle);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isCreatingStudent, setIsCreatingStudent] = useState(false);
  const [createError, setCreateError] = useState('');
  // const [studentForAssignment, setStudentForAssignment] = useState(null);
  const [studentForEdit, setStudentForEdit] = useState(null);
  const [isUpdatingStudent, setIsUpdatingStudent] = useState(false);
  const [updateError, setUpdateError] = useState('');
  const [isMaintenanceOpen, setIsMaintenanceOpen] = useState(false);
  const [filterMode, setFilterMode] = useState('all'); // 'mine' | 'all'
  const [searchQuery, setSearchQuery] = useState('');
  const [dayFilter, setDayFilter] = useState(null);
  const [instructorFilterId, setInstructorFilterId] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [sortBy, setSortBy] = useState(STUDENT_SORT_OPTIONS.SCHEDULE); // Default sort by schedule
  const [statusFilter, setStatusFilter] = useState('active'); // 'active' | 'inactive' | 'all'
  const [filteredStudents, setFilteredStudents] = useState([]); // Local client-side filtered list

  // Mobile fix: prevent Dialog close when Select is open/closing
  const openSelectCountRef = useRef(0);
  const isClosingSelectRef = useRef(false);

  // Role-based access control: Only admin/owner can access this page
  const membershipRole = activeOrg?.membership?.role;
  const normalizedRole = useMemo(() => normalizeMembershipRole(membershipRole), [membershipRole]);
  const isAdminMember = isAdminRole(normalizedRole);

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

  const fetchComplianceSummary = useCallback(async () => {
    if (!canFetch) {
      return;
    }

    try {
      const searchParams = new URLSearchParams({ org_id: activeOrgId });
      const payload = await authenticatedFetch(`students/compliance-summary?${searchParams.toString()}`, { session });
      setComplianceSummary(payload || {});
    } catch (error) {
      console.error('Failed to load compliance summary', error);
      // Don't show error toast - this is supplementary data
      setComplianceSummary({});
    }
  }, [canFetch, activeOrgId, session]);

  const fetchStudents = useCallback(async () => {
    if (!canFetch) {
      return;
    }

    setStudentsState(REQUEST_STATES.loading);
    setStudentsError('');

    try {
      // Smart fetching: only fetch what we need
      // If looking for active only, just fetch active; if looking for all, fetch all
      const statusParam = statusFilter === 'all' ? 'all' : statusFilter;
      const searchParams = new URLSearchParams({ org_id: activeOrgId, status: statusParam });
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
  }, [canFetch, activeOrgId, session, statusFilter]);

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
    const promises = [
      fetchStudents(),
      // Compliance summary is optional - don't let it block the main data load
      fetchComplianceSummary().catch(() => {}),
    ];
    
    if (includeInstructors) {
      promises.push(fetchInstructors());
    }
    
    await Promise.all(promises);
  }, [fetchStudents, fetchComplianceSummary, fetchInstructors]);

  const handleMaintenanceCompleted = useCallback(async () => {
    await refreshRoster(true);
  }, [refreshRoster]);

  // Load saved filter state on mount
  useEffect(() => {
    if (!activeOrgId) return;
    
    const savedFilters = loadFilterState(activeOrgId, 'admin');
    if (savedFilters) {
      if (savedFilters.filterMode !== undefined) setFilterMode(savedFilters.filterMode);
      if (savedFilters.searchQuery !== undefined) setSearchQuery(savedFilters.searchQuery);
      if (savedFilters.dayFilter !== undefined) setDayFilter(savedFilters.dayFilter);
      if (savedFilters.instructorFilterId !== undefined) setInstructorFilterId(savedFilters.instructorFilterId);
      if (savedFilters.tagFilter !== undefined) setTagFilter(savedFilters.tagFilter);
      if (savedFilters.sortBy !== undefined) setSortBy(savedFilters.sortBy);
      if (savedFilters.statusFilter !== undefined) setStatusFilter(savedFilters.statusFilter);
    }
  }, [activeOrgId]);

  useEffect(() => {
    if (canFetch) {
      // Refetch when statusFilter changes to get the right subset from server
      refreshRoster(true);
      void loadTags();
    } else {
      setStudents([]);
      setInstructors([]);
    }
  }, [canFetch, refreshRoster, loadTags]);

  // Default the view for admins/owners who are also instructors to "mine" on first visit
  useEffect(() => {
    if (!user || !Array.isArray(instructors) || instructors.length === 0 || !activeOrgId) return;
    
    // Check if this admin is also an instructor
    const isInstructor = instructors.some((i) => i?.id === user.id);
    if (!isInstructor) return;
    
    // Only set default if no saved 'admin' filter exists for this org
    const savedFilters = loadFilterState(activeOrgId, 'admin');
    const hasExistingPreference = savedFilters && savedFilters.filterMode !== undefined;
    
    if (!hasExistingPreference) {
      setFilterMode('mine');
    }
  }, [user, instructors, activeOrgId]);

  // Refetch students when statusFilter changes
  useEffect(() => {
    if (canFetch) {
      void fetchStudents();
    }
  }, [statusFilter, canFetch, fetchStudents]);

  // Ensure instructor-specific filter is cleared when viewing "my students"
  useEffect(() => {
    if (filterMode === 'mine' && instructorFilterId) {
      setInstructorFilterId('');
    }
  }, [filterMode, instructorFilterId]);

  // Save filter state whenever it changes
  useEffect(() => {
    if (activeOrgId) {
      saveFilterState(activeOrgId, 'admin', {
        filterMode,
        searchQuery,
        dayFilter,
        instructorFilterId,
        tagFilter,
        sortBy,
        statusFilter,
      });
    }
  }, [activeOrgId, filterMode, searchQuery, dayFilter, instructorFilterId, tagFilter, sortBy, statusFilter]);

  // Client-side filtering and sorting - applied to all fetched students
  useEffect(() => {
    let result = students;

    // Filter by status
    if (statusFilter !== 'all') {
      result = result.filter((s) => {
        const isActive = s.is_active !== false;
        return statusFilter === 'active' ? isActive : !isActive;
      });
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((s) => {
        const name = (s.name || '').toLowerCase();
        const phone = (s.phone || '').toLowerCase();
        const nationalId = (s.national_id || '').toLowerCase();
        return name.includes(query) || phone.includes(query) || nationalId.includes(query);
      });
    }

    // Filter by day of week
    if (dayFilter !== null) {
      result = result.filter((s) => {
        if (!s.schedule || !Array.isArray(s.schedule)) return false;
        return s.schedule.some((day) => day.day === dayFilter);
      });
    }

    // Filter by instructor
    if (instructorFilterId) {
      result = result.filter((s) => s.assigned_instructor_id === instructorFilterId);
    }

    // Filter by tag
    if (tagFilter) {
      result = result.filter((s) => {
        const studentTags = s.tags || [];
        return studentTags.includes(tagFilter);
      });
    }

    // Filter by mode
    if (filterMode === 'mine' && user?.id) {
      result = result.filter((s) => s.assigned_instructor_id === user.id);
    }

    // Sort
    const comparator = getStudentComparator(sortBy);
    result.sort(comparator);

    setFilteredStudents(result);
  }, [students, statusFilter, searchQuery, dayFilter, instructorFilterId, tagFilter, filterMode, sortBy, user?.id]);

  const handleResetFilters = () => {
    setFilterMode('all');
    setInstructorFilterId('');
    setSearchQuery('');
    setDayFilter(null);
    setTagFilter('');
    setSortBy(STUDENT_SORT_OPTIONS.SCHEDULE);
    setStatusFilter('active');
  };

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return (
      searchQuery.trim() !== '' ||
      dayFilter !== null ||
      instructorFilterId !== '' ||
      tagFilter !== '' ||
      filterMode !== 'all' ||
      statusFilter !== 'active'
    );
  }, [searchQuery, dayFilter, instructorFilterId, tagFilter, filterMode, statusFilter]);

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

  const handleOpenMaintenance = () => {
    setIsMaintenanceOpen(true);
  };

  const handleCloseMaintenance = () => {
    setIsMaintenanceOpen(false);
  };

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

  const handleCreateStudent = async ({
    name,
    nationalId,
    contactName,
    contactPhone,
    assignedInstructorId,
    defaultService,
    defaultDayOfWeek,
    defaultSessionTime,
    notes,
    tags,
    isActive,
  }) => {
    if (!canFetch) {
      return;
    }

    setIsCreatingStudent(true);
    setCreateError('');

    try {
      const normalizedTags = normalizeTagIdsForWrite(tags);
      const body = {
        org_id: activeOrgId,
        name,
        national_id: nationalId || null,
        contact_name: contactName,
        contact_phone: contactPhone,
        assigned_instructor_id: assignedInstructorId,
        default_service: defaultService,
        default_day_of_week: defaultDayOfWeek,
        default_session_time: defaultSessionTime,
        notes,
        tags: normalizedTags,
        is_active: isActive,
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
        national_id: payload.nationalId || null,
        contact_name: payload.contactName,
        contact_phone: payload.contactPhone,
        assigned_instructor_id: payload.assignedInstructorId,
        default_service: payload.defaultService,
        default_day_of_week: payload.defaultDayOfWeek,
        default_session_time: payload.defaultSessionTime,
        notes: payload.notes,
        tags: normalizeTagIdsForWrite(payload.tags),
        is_active: payload.isActive,
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
    // Use the pre-computed filtered students from our comprehensive filter effect
    return filteredStudents;
  }, [filteredStudents]);

  if (supabaseLoading) {
    return (
      <div className="p-6 text-center text-neutral-600">
        טוען חיבור...
      </div>
    );
  }

  // Redirect non-admin users to instructor view
  if (activeOrg && !isAdminMember) {
    return <Navigate to="/my-students" replace />;
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
        <div className="flex items-center gap-2 self-start">
          <DataMaintenanceMenu 
            onImportClick={handleOpenMaintenance}
            instructors={instructors}
            tags={tagOptions}
          />
          <Button type="button" className="gap-2" onClick={handleOpenAddDialog}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            תלמיד חדש
          </Button>
        </div>
      )}
    >

      <Card className="w-full">
        <CardHeader className="space-y-sm">
          <div className="flex flex-col gap-sm sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base font-semibold text-foreground">רשימת תלמידים</CardTitle>
            {instructorsState === REQUEST_STATES.loading ? (
              <p className="flex items-center gap-xs text-sm text-neutral-600">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                טוען רשימת מדריכים...
              </p>
            ) : null}
          </div>

          {/* New filter section */}
          <StudentFilterSection
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            statusFilter={statusFilter}
            onStatusChange={setStatusFilter}
            dayFilter={dayFilter}
            onDayChange={setDayFilter}
            instructorFilterId={instructorFilterId}
            onInstructorFilterChange={setInstructorFilterId}
            tagFilter={tagFilter}
            onTagFilterChange={setTagFilter}
            sortBy={sortBy}
            onSortChange={setSortBy}
            instructors={instructors}
            tags={tagOptions}
            hasActiveFilters={hasActiveFilters}
            onResetFilters={handleResetFilters}
          />
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
                  <TableHead className="hidden text-right text-sm font-medium text-neutral-600 md:table-cell">יום</TableHead>
                  <TableHead className="hidden text-right text-sm font-medium text-neutral-600 md:table-cell">שעה</TableHead>
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
                  const dayLabel = DAY_NAMES[student.default_day_of_week] || '—';
                  const timeLabel = formatDefaultTime(student.default_session_time) || '—';
                  const expiredCount = complianceSummary[student.id]?.expiredDocuments || 0;
                  const missingNationalId = !student.national_id;

                  return (
                    <TableRow key={student.id}>
                      <TableCell className="text-sm font-semibold text-foreground">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              {student.id ? (
                                <Link to={`/students/${student.id}`} className="text-primary hover:underline">
                                  {student.name || 'ללא שם'}
                                </Link>
                              ) : (
                                student.name || 'ללא שם'
                              )}
                              {student.is_active === false ? (
                                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                                  לא פעיל
                                </Badge>
                              ) : null}
                              {missingNationalId ? (
                                <Badge variant="destructive" className="gap-1 text-xs">
                                  <FileWarning className="h-3 w-3" />
                                  חסר מספר זהות
                                </Badge>
                              ) : null}
                              {expiredCount > 0 && (
                                <Badge variant="destructive" className="gap-1 text-xs">
                                  <FileWarning className="h-3 w-3" />
                                  {expiredCount} מסמכים פגי תוקף
                                </Badge>
                              )}
                            </div>
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
                            {/* Show day and time on mobile (md breakpoint hides the separate columns) */}
                            <div className="mt-0.5 text-xs text-neutral-500 md:hidden">
                              {dayLabel} • {timeLabel}
                            </div>
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
                      <TableCell className="hidden text-sm text-neutral-600 md:table-cell">
                        {dayLabel}
                      </TableCell>
                      <TableCell className="hidden text-sm text-neutral-600 md:table-cell">
                        {timeLabel}
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

      <DataMaintenanceModal
        open={isMaintenanceOpen}
        onClose={handleCloseMaintenance}
        orgId={activeOrgId}
        onRefresh={handleMaintenanceCompleted}
      />

      <Dialog open={isAddDialogOpen} onOpenChange={(open) => { if (!open) handleCloseAddDialog(); }}>
        <DialogContent
          className="sm:max-w-xl"
          onInteractOutside={handleDialogInteractOutside}
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
            onSelectOpenChange={handleSelectOpenChange}
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
