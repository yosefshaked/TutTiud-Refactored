import React, { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Loader2, Users, User, FileWarning } from "lucide-react"

import { useSupabase } from "@/context/SupabaseContext.jsx"
import { useOrg } from "@/org/OrgContext.jsx"
import { authenticatedFetch } from "@/lib/api-client.js"
import PageLayout from "@/components/ui/PageLayout.jsx"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { buildStudentsEndpoint, normalizeMembershipRole, isAdminRole } from "@/features/students/utils/endpoints.js"
import { describeSchedule, dayMatches } from "@/features/students/utils/schedule.js"
import { StudentFilterSection } from "@/features/students/components/StudentFilterSection.jsx"
import { saveFilterState, loadFilterState } from "@/features/students/utils/filter-state.js"
import { STUDENT_SORT_OPTIONS, getStudentComparator } from "@/features/students/utils/sorting.js"
import { useStudentTags } from "@/features/students/hooks/useStudentTags.js"

const REQUEST_STATUS = Object.freeze({
  idle: "idle",
  loading: "loading",
  success: "success",
  error: "error",
})

export default function MyStudentsPage() {
  const { loading: supabaseLoading } = useSupabase()
  const { activeOrg, activeOrgHasConnection, tenantClientReady } = useOrg()
  const { tagOptions, loadTags } = useStudentTags()

  const [students, setStudents] = useState([])
  const [complianceSummary, setComplianceSummary] = useState({}) // Map of student_id -> { expiredDocuments: number }
  const [status, setStatus] = useState(REQUEST_STATUS.idle)
  const [errorMessage, setErrorMessage] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [dayFilter, setDayFilter] = useState(null)
  const [tagFilter, setTagFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const [sortBy, setSortBy] = useState(STUDENT_SORT_OPTIONS.SCHEDULE)
  const [canViewInactive, setCanViewInactive] = useState(false)

  const activeOrgId = activeOrg?.id ?? null
  const membershipRole = activeOrg?.membership?.role
  const normalizedRole = useMemo(() => normalizeMembershipRole(membershipRole), [membershipRole])
  const isAdminMember = isAdminRole(normalizedRole)

  const canFetch = useMemo(() => {
    return (
      Boolean(activeOrgId) &&
      tenantClientReady &&
      activeOrgHasConnection &&
      !supabaseLoading &&
      !isAdminMember
    )
  }, [activeOrgId, tenantClientReady, activeOrgHasConnection, supabaseLoading, isAdminMember])

  // Load saved filter state on mount (except statusFilter which depends on permissions)
  useEffect(() => {
    if (activeOrgId) {
      void loadTags()
      const savedFilters = loadFilterState(activeOrgId, 'instructor')
      if (savedFilters) {
        if (savedFilters.searchQuery !== undefined) setSearchQuery(savedFilters.searchQuery)
        if (savedFilters.dayFilter !== undefined) setDayFilter(savedFilters.dayFilter)
        if (savedFilters.tagFilter !== undefined) setTagFilter(savedFilters.tagFilter)
        // Don't restore statusFilter yet - wait for permission check
        if (savedFilters.sortBy !== undefined) setSortBy(savedFilters.sortBy)
      }
    }
  }, [activeOrgId, loadTags])

  // Save filter state whenever it changes
  useEffect(() => {
    if (activeOrgId) {
      saveFilterState(activeOrgId, 'instructor', {
        searchQuery,
        dayFilter,
        tagFilter,
        statusFilter,
        sortBy,
      })
    }
  }, [activeOrgId, searchQuery, dayFilter, tagFilter, statusFilter, sortBy])

  // Load visibility setting and handle statusFilter restoration/reset
  useEffect(() => {
    if (!activeOrgId || !activeOrgHasConnection || !tenantClientReady) {
      setCanViewInactive(false)
      setStatusFilter('active') // Always reset when org changes
      return
    }

    let cancelled = false
    const abortController = new AbortController()

    const loadVisibilitySetting = async () => {
      try {
        const searchParams = new URLSearchParams({ org_id: activeOrgId, keys: 'instructors_can_view_inactive_students' })
        const payload = await authenticatedFetch(`settings?${searchParams.toString()}`, {
          signal: abortController.signal,
        })
        const entry = payload?.settings?.instructors_can_view_inactive_students
        const value = entry && typeof entry === 'object' && Object.prototype.hasOwnProperty.call(entry, 'value')
          ? entry.value
          : entry
        const allowed = value === true
        if (!cancelled) {
          setCanViewInactive(allowed)
          
          // If permission is not available, force to 'active'
          if (!allowed) {
            setStatusFilter('active')
          } else {
            // Permission is available - restore saved filter if exists
            const savedFilters = loadFilterState(activeOrgId, 'instructor')
            if (savedFilters?.statusFilter && savedFilters.statusFilter !== 'active') {
              setStatusFilter(savedFilters.statusFilter)
            }
          }
        }
      } catch (error) {
        if (error?.name === 'AbortError') {
          return
        }
        console.error('Failed to load instructor visibility setting', error)
        if (!cancelled) {
          setCanViewInactive(false)
          setStatusFilter('active')
        }
      }
    }

    void loadVisibilitySetting()

    return () => {
      cancelled = true
      abortController.abort()
    }
  }, [activeOrgId, activeOrgHasConnection, tenantClientReady])
  
  // Separate effect: force statusFilter to 'active' when permission is revoked
  useEffect(() => {
    if (!canViewInactive && statusFilter !== 'active') {
      setStatusFilter('active')
    }
  }, [canViewInactive, statusFilter])

  useEffect(() => {
    if (!canFetch) {
      setStatus(REQUEST_STATUS.idle)
      setErrorMessage("")
      setStudents([])
      setComplianceSummary({})
      return
    }

    let isMounted = true
    const abortController = new AbortController()

    async function loadStudents() {
      setStatus(REQUEST_STATUS.loading)
      setErrorMessage("")

      try {
        // Smart fetching: use statusFilter directly if instructor can view inactive, else always fetch active only
        const statusParam = canViewInactive ? statusFilter : 'active'
        const endpoint = buildStudentsEndpoint(activeOrgId, normalizedRole, {
          status: statusParam,
        })
        
        // Fetch students - skip compliance summary for non-admin users (they don't have permission)
        const fetchPromises = [
          authenticatedFetch(endpoint, { signal: abortController.signal })
        ]
        
        // Only admin/owner can access compliance summary endpoint
        if (isAdminMember) {
          fetchPromises.push(
            authenticatedFetch(`students/compliance-summary?org_id=${activeOrgId}`, { signal: abortController.signal })
              .catch(err => {
                console.error('Failed to load compliance summary', err)
                return {} // Don't fail if compliance summary fails
              })
          )
        }
        
        const results = await Promise.all(fetchPromises)
        const studentsPayload = results[0]
        const compliancePayload = results[1] || {} // Will be empty object for non-admin users

        if (!isMounted) {
          return
        }

        setStudents(Array.isArray(studentsPayload) ? studentsPayload : [])
        setComplianceSummary(compliancePayload || {})
        setStatus(REQUEST_STATUS.success)
      } catch (error) {
        if (error?.name === "AbortError") {
          return
        }

        console.error("Failed to load instructor students", error)

        if (!isMounted) {
          return
        }

        setErrorMessage(error?.message || "טעינת רשימת התלמידים נכשלה.")
        setStudents([])
        setComplianceSummary({})
        setStatus(REQUEST_STATUS.error)
      }
    }

    void loadStudents()

    return () => {
      isMounted = false
      abortController.abort()
    }
  }, [activeOrgId, canFetch, normalizedRole, statusFilter, canViewInactive, isAdminMember])

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return (
      searchQuery.trim() !== '' ||
      dayFilter !== null ||
      tagFilter !== '' ||
      (canViewInactive && statusFilter !== 'active')
    )
  }, [searchQuery, dayFilter, tagFilter, statusFilter, canViewInactive])

  const handleResetFilters = () => {
    setSearchQuery('')
    setDayFilter(null)
    setTagFilter('')
    setSortBy(STUDENT_SORT_OPTIONS.SCHEDULE)
    if (canViewInactive) {
      setStatusFilter('active')
    }
  }

  const isLoading = status === REQUEST_STATUS.loading
  const isError = status === REQUEST_STATUS.error
  const isSuccess = status === REQUEST_STATUS.success

  const filteredStudents = useMemo(() => {
    let result = students;

    // Filter by status - if instructor cannot view inactive, this is already filtered on server
    if (canViewInactive && statusFilter !== 'all') {
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
        const phone = (s.contact_phone || '').toLowerCase();
        const nationalId = (s.national_id || '').toLowerCase();
        return name.includes(query) || phone.includes(query) || nationalId.includes(query);
      });
    }

    // Filter by day of week
    if (dayFilter !== null) {
      result = result.filter((s) => dayMatches(s.default_day_of_week, dayFilter));
    }

    // Filter by tag
    if (tagFilter) {
      result = result.filter((s) => {
        const studentTags = s.tags || [];
        return studentTags.includes(tagFilter);
      });
    }

    // Sort
    const comparator = getStudentComparator(sortBy);
    result.sort(comparator);

    return result;
  }, [students, searchQuery, dayFilter, tagFilter, statusFilter, sortBy, canViewInactive])

  const hasNoResults = isSuccess && filteredStudents.length === 0

  return (
    <PageLayout
      title="התלמידים שלי"
      description="רשימת התלמידים שהוקצו לך בארגון הנוכחי."
      fullHeight={false}
    >
      {supabaseLoading ? (
        <div className="flex items-center justify-center gap-sm rounded-xl bg-neutral-50 p-lg text-neutral-600" role="status">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          <span>טוען חיבור מאובטח...</span>
        </div>
      ) : !activeOrg ? (
        <div className="rounded-xl bg-neutral-50 p-lg text-center text-neutral-600" role="status">
          בחרו ארגון כדי להציג את התלמידים שהוקצו לכם.
        </div>
      ) : !activeOrgHasConnection ? (
        <div className="rounded-xl bg-amber-50 p-lg text-center text-amber-800" role="status">
          דרוש חיבור מאומת למסד הנתונים של הארגון כדי להציג את רשימת התלמידים.
        </div>
      ) : isAdminMember ? (
        <div className="rounded-xl bg-neutral-50 p-lg text-center text-neutral-600" role="status">
          עמוד זה מיועד למדריכים. מנהלים ובעלי ארגון יכולים לצפות ברשימת התלמידים המלאה דרך עמוד ניהול התלמידים.
        </div>
      ) : isError ? (
        <div className="rounded-xl bg-red-50 p-lg text-center text-red-700" role="alert">
          {errorMessage || "טעינת רשימת התלמידים נכשלה. נסו שוב מאוחר יותר."}
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center gap-sm rounded-xl bg-neutral-50 p-lg text-neutral-600" role="status">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          <span>טוען את התלמידים שהוקצו לך...</span>
        </div>
      ) : isSuccess ? (
        <Card className="w-full">
          <CardHeader className="space-y-sm">
            <CardTitle className="text-base font-semibold text-foreground">רשימת התלמידים שלי</CardTitle>
            
            <StudentFilterSection
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              statusFilter={statusFilter}
              onStatusChange={setStatusFilter}
              dayFilter={dayFilter}
              onDayChange={setDayFilter}
              tagFilter={tagFilter}
              onTagFilterChange={setTagFilter}
              sortBy={sortBy}
              onSortChange={setSortBy}
              instructors={[]}
              tags={tagOptions}
              showInstructorFilter={false}
              showStatusFilter={canViewInactive}
              hasActiveFilters={hasActiveFilters}
              onResetFilters={handleResetFilters}
            />
          </CardHeader>
          
          <CardContent>
            {hasNoResults ? (
                <div className="flex flex-col items-center justify-center gap-sm rounded-xl border border-dashed border-neutral-200 p-xl text-center text-neutral-600">
                  <Users className="h-10 w-10 text-neutral-400" aria-hidden="true" />
                  <p className="text-body-md">{searchQuery ? 'לא נמצאו תלמידים התואמים את החיפוש.' : 'לא הוקצו לך תלמידים עדיין.'}</p>
                  <p className="text-body-sm text-neutral-500">
                    {searchQuery ? 'נסו חיפוש אחר או נקו את תיבת החיפוש.' : 'כאשר מנהל הארגון יקצה אותך לתלמיד, הוא יופיע כאן.'}
                  </p>
                </div>
            ) : (
              <div className="grid gap-md md:grid-cols-2">
                {filteredStudents.map((student) => {
                  const contactName = student.contact_name || ''
                  const contactPhone = student.contact_phone || ''
                  const contactDisplay = [contactName, contactPhone].filter(Boolean).join(' · ')
                  const legacyContactInfo = student?.contact_info?.trim?.()
                  const finalContactDisplay = contactDisplay || legacyContactInfo || "לא סופק מידע ליצירת קשר"
                  const schedule = describeSchedule(student?.default_day_of_week, student?.default_session_time)
                  const expiredCount = complianceSummary[student.id]?.expiredDocuments || 0

                  return (
                    <Card key={student.id || student.name}>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg font-semibold text-neutral-900">
                          <span className="flex-1">{student?.name || "ללא שם"}</span>
                          {student?.is_active === false ? (
                            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                              לא פעיל
                            </Badge>
                          ) : null}
                          {expiredCount > 0 && (
                            <Badge variant="destructive" className="gap-1 text-xs">
                              <FileWarning className="h-3 w-3" />
                              {expiredCount}
                            </Badge>
                          )}
                          {(contactName || contactPhone) && (
                            <Popover>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  className="rounded-full p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
                                  aria-label="הצג פרטי קשר"
                                >
                                  <User className="h-5 w-5" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-64 text-sm" align="end">
                                <div className="space-y-2">
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
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <dl className="space-y-sm text-sm text-neutral-600">
                          <div>
                            <dt className="font-medium text-neutral-700">יום ושעת המפגש</dt>
                            <dd>{schedule || '—'}</dd>
                          </div>
                          <div>
                            <dt className="font-medium text-neutral-700">פרטי קשר</dt>
                            <dd>
                              {contactPhone ? (
                                <a href={`tel:${contactPhone}`} className="text-primary hover:underline">
                                  {finalContactDisplay}
                                </a>
                              ) : (
                                finalContactDisplay
                              )}
                            </dd>
                          </div>
                        </dl>
                        {student?.id ? (
                          <div className="pt-sm">
                            <Link to={`/students/${student.id}`} className="text-sm font-semibold text-primary hover:underline">
                              צפייה בפרטי התלמיד
                            </Link>
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </PageLayout>
  )
}
