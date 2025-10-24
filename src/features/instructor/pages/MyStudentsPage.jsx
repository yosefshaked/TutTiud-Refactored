import React, { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Loader2, Users } from "lucide-react"

import { useSupabase } from "@/context/SupabaseContext.jsx"
import { useOrg } from "@/org/OrgContext.jsx"
import { authenticatedFetch } from "@/lib/api-client.js"
import PageLayout from "@/components/ui/PageLayout.jsx"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { buildStudentsEndpoint, normalizeMembershipRole, isAdminRole } from "@/features/students/utils/endpoints.js"

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
  const isEmpty = isSuccess && students.length === 0

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
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center gap-sm rounded-xl border border-dashed border-neutral-200 p-xl text-center text-neutral-600">
          <Users className="h-10 w-10 text-neutral-400" aria-hidden="true" />
          <p className="text-body-md">לא הוקצו לך תלמידים עדיין.</p>
          <p className="text-body-sm text-neutral-500">כאשר מנהל הארגון יקצה אותך לתלמיד, הוא יופיע כאן.</p>
        </div>
      ) : (
        <div className="grid gap-md md:grid-cols-2">
          {students.map((student) => {
            const contactInfo = student?.contact_info?.trim?.() || "לא סופק מידע ליצירת קשר"

            return (
              <Card key={student.id || student.name}>
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-neutral-900">
                    {student?.name || "ללא שם"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-sm text-sm text-neutral-600">
                    <div>
                      <dt className="font-medium text-neutral-700">פרטי קשר</dt>
                      <dd>{contactInfo}</dd>
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
    </PageLayout>
  )
}
