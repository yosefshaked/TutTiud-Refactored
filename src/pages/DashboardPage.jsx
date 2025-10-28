import React, { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"

import PageLayout from "@/components/ui/PageLayout.jsx"
import Card from "@/components/ui/CustomCard.jsx"
import { useAuth } from "@/auth/AuthContext.jsx"
import { useOrg } from "@/org/OrgContext.jsx"
import { useSessionModal } from "@/features/sessions/context/SessionModalContext.jsx"
import { authenticatedFetch } from "@/lib/api-client.js"

function buildGreeting(instructorName, user) {
  // Priority 1: Instructor name from Instructors table
  if (instructorName && typeof instructorName === "string") {
    const name = instructorName.trim()
    if (name && !name.includes('@')) {
      return `ברוך הבא, ${name}!`
    }
  }

  // Priority 2: User display name from profile
  if (user) {
    const displayName = typeof user.name === "string" ? user.name.trim() : ""
    if (displayName && !displayName.includes('@')) {
      return `ברוך הבא, ${displayName}!`
    }

    // Priority 3: User email
    if (user.email) {
      return `ברוך הבא, ${user.email}!`
    }
  }

  return "ברוך הבא!"
}

export default function DashboardPage() {
  const { user, session } = useAuth()
  const { activeOrg, activeOrgId, activeOrgHasConnection, tenantClientReady } = useOrg()
  const { openSessionModal } = useSessionModal()
  const [instructorName, setInstructorName] = useState(null)

  const membershipRole = activeOrg?.membership?.role
  const { studentsLink, studentsTitle, studentsDescription } = useMemo(() => {
    const normalizedRole = typeof membershipRole === "string" ? membershipRole.toLowerCase() : "member"
    const isAdminRole = normalizedRole === "admin" || normalizedRole === "owner"

    if (isAdminRole) {
      return {
        studentsLink: "/admin/students",
        studentsTitle: "ניהול תלמידים",
        studentsDescription: "מעבר לרשימת כלל התלמידים בארגון",
      }
    }

    return {
      studentsLink: "/my-students",
      studentsTitle: "התלמידים שלי",
      studentsDescription: "מעבר לרשימת התלמידים המשויכים אליך",
    }
  }, [membershipRole])

  // Fetch instructor name from Instructors table
  useEffect(() => {
    if (!user?.id || !activeOrgId || !tenantClientReady || !activeOrgHasConnection || !session) {
      return
    }

    let isMounted = true

    async function fetchInstructorName() {
      try {
        const searchParams = new URLSearchParams({ org_id: activeOrgId })
        const instructors = await authenticatedFetch(`instructors?${searchParams.toString()}`, { session })
        
        if (!isMounted) return

        if (Array.isArray(instructors)) {
          const instructor = instructors.find(i => i.id === user.id)
          if (instructor?.name) {
            setInstructorName(instructor.name)
          }
        }
      } catch (error) {
        console.error('Failed to fetch instructor name:', error)
        // Silently fail - will fall back to user.name or email
      }
    }

    fetchInstructorName()

    return () => {
      isMounted = false
    }
  }, [user?.id, activeOrgId, tenantClientReady, activeOrgHasConnection, session])

  const greeting = buildGreeting(instructorName, user)

  return (
    <PageLayout
      title={greeting}
      subtitle="מה תרצו לעשות כעת?"
      className="space-y-xl"
    >
      <div className="grid grid-cols-1 gap-lg md:grid-cols-2">
        <Link to={studentsLink} className="group focus-visible:outline-none">
          <Card
            className="group h-full cursor-pointer rounded-2xl border border-border bg-surface p-lg text-right shadow-sm transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg group-focus-visible:ring-2 group-focus-visible:ring-primary/40"
          >
            <h2 className="text-2xl font-semibold text-foreground group-hover:text-primary">
              {studentsTitle}
            </h2>
            <p className="mt-sm text-neutral-600">
              {studentsDescription}
            </p>
          </Card>
        </Link>

        <button
          type="button"
          onClick={() => openSessionModal?.()}
          className="group focus-visible:outline-none"
          aria-label="פתיחת טופס רישום מפגש חדש"
        >
          <Card
            className="group h-full cursor-pointer rounded-2xl border border-border bg-surface p-lg text-right shadow-sm transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg group-focus-visible:ring-2 group-focus-visible:ring-primary/40"
          >
            <h2 className="text-2xl font-semibold text-foreground group-hover:text-primary">
              תיעוד מפגש חדש
            </h2>
            <p className="mt-sm text-neutral-600">
              פתיחת טופס התיעוד בדיוק כמו לחצן הפלוס המרכזי.
            </p>
          </Card>
        </button>
      </div>
    </PageLayout>
  )
}
