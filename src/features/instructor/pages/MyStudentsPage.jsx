import React, { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Loader2, Users, Search, X, User, RotateCcw } from "lucide-react"

import { useSupabase } from "@/context/SupabaseContext.jsx"
import { useOrg } from "@/org/OrgContext.jsx"
import { authenticatedFetch } from "@/lib/api-client.js"
import PageLayout from "@/components/ui/PageLayout.jsx"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { buildStudentsEndpoint, normalizeMembershipRole, isAdminRole } from "@/features/students/utils/endpoints.js"
import { includesDayQuery, describeSchedule } from "@/features/students/utils/schedule.js"
import { sortStudentsBySchedule } from "@/features/students/utils/sorting.js"
import DayOfWeekSelect from "@/components/ui/DayOfWeekSelect.jsx"

const REQUEST_STATUS = Object.freeze({
  idle: "idle",
  loading: "loading",
  success: "success",
  error: "error",
})

export default function MyStudentsPage() {
  const { loading: supabaseLoading } = useSupabase()
  const { activeOrg, activeOrgHasConnection, tenantClientReady } = useOrg()

  const [students, setStudents] = useState([])
  const [status, setStatus] = useState(REQUEST_STATUS.idle)
  const [errorMessage, setErrorMessage] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [dayFilter, setDayFilter] = useState(null)

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

  useEffect(() => {
    if (!canFetch) {
      setStatus(REQUEST_STATUS.idle)
      setErrorMessage("")
      setStudents([])
      return
    }

    let isMounted = true
    const abortController = new AbortController()

    async function loadStudents() {
      setStatus(REQUEST_STATUS.loading)
      setErrorMessage("")

      try {
        const endpoint = buildStudentsEndpoint(activeOrgId, normalizedRole)
        const payload = await authenticatedFetch(endpoint, {
          signal: abortController.signal,
        })

        if (!isMounted) {
          return
        }

        setStudents(Array.isArray(payload) ? payload : [])
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
        setStatus(REQUEST_STATUS.error)
      }
    }

    void loadStudents()

    return () => {
      isMounted = false
      abortController.abort()
    }
  }, [activeOrgId, canFetch, normalizedRole])

  const isLoading = status === REQUEST_STATUS.loading
  const isError = status === REQUEST_STATUS.error
  const isSuccess = status === REQUEST_STATUS.success

  const filteredStudents = useMemo(() => {
    const query = searchQuery.toLowerCase().trim()
    const filtered = students.filter((student) => {
      try {
        if (dayFilter && Number(student?.default_day_of_week) !== Number(dayFilter)) {
          return false
        }

        if (!query) return true
        // Search by student name
        const studentName = String(student.name || '').toLowerCase()
        if (studentName.includes(query)) return true

        // Search by contact name
        const contactName = String(student.contact_name || '').toLowerCase()
        if (contactName.includes(query)) return true

        // Search by contact phone
        const contactPhone = String(student.contact_phone || '').toLowerCase()
        if (contactPhone.includes(query)) return true

        // Search by legacy contact_info field
        const contactInfo = String(student.contact_info || '').toLowerCase()
        if (contactInfo.includes(query)) return true

  // Search by default day of week (Hebrew label)
  if (includesDayQuery(student.default_day_of_week, query)) return true

        // Search by default session time
        const sessionTime = String(student.default_session_time || '').toLowerCase()
        if (sessionTime.includes(query)) return true

        return false
      } catch (error) {
        console.error('Error filtering student:', student, error)
        return false
      }
    })
    
    // Apply default sorting by schedule (day → hour → name)
    // Note: instructor comparison is not needed here as all students belong to the same instructor
    return sortStudentsBySchedule(filtered, new Map())
  }, [students, searchQuery, dayFilter])

  const handleResetFilters = () => {
    setSearchQuery('')
    setDayFilter(null)
  }

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return searchQuery.trim() !== '' || dayFilter !== null
  }, [searchQuery, dayFilter])

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
            <>
              <div className="mb-md">
                <div className="grid grid-cols-1 gap-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="relative w-full">
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
                  <div className="flex gap-sm items-center">
                    <DayOfWeekSelect
                      value={dayFilter}
                      onChange={setDayFilter}
                      placeholder="סינון לפי יום"
                    />
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
                </div>
                {searchQuery && (
                  <div className="mt-sm text-xs text-neutral-600">
                    נמצאו {filteredStudents.length} תלמידים
                  </div>
                )}
              </div>
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

            return (
              <Card key={student.id || student.name}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg font-semibold text-neutral-900">
                    <span className="flex-1">{student?.name || "ללא שם"}</span>
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
        </>
      ) : null}
    </PageLayout>
  )
}
