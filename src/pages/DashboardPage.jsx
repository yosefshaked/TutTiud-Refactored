import React from "react"
import { Link } from "react-router-dom"

import PageLayout from "@/components/ui/PageLayout.jsx"
import Card from "@/components/ui/Card.jsx"
import { useAuth } from "@/auth/AuthContext.jsx"

function buildGreeting(user) {
  if (!user) {
    return "Welcome!"
  }

  if (user.name) {
    return `Welcome, ${user.name}!`
  }

  if (user.email) {
    return `Welcome, ${user.email}!`
  }

  return "Welcome!"
}

export default function DashboardPage() {
  const { user } = useAuth()
  const greeting = buildGreeting(user)

  return (
    <PageLayout
      title={greeting}
      subtitle="Choose your next action to get started"
      className="space-y-xl"
    >
      <div className="grid grid-cols-1 gap-lg md:grid-cols-2">
        <Link to="/my-students" className="group focus-visible:outline-none">
          <Card
            className="group h-full cursor-pointer rounded-2xl border border-border bg-surface p-lg text-right shadow-sm transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg group-focus-visible:ring-2 group-focus-visible:ring-primary/40"
          >
            <h2 className="text-2xl font-semibold text-foreground group-hover:text-primary">
              View My Students
            </h2>
            <p className="mt-sm text-neutral-600">
              See the roster assigned to you and open any student record in seconds.
            </p>
          </Card>
        </Link>

        <Link to="/TimeEntry" className="group focus-visible:outline-none">
          <Card
            className="group h-full cursor-pointer rounded-2xl border border-border bg-surface p-lg text-right shadow-sm transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg group-focus-visible:ring-2 group-focus-visible:ring-primary/40"
          >
            <h2 className="text-2xl font-semibold text-foreground group-hover:text-primary">
              Document a New Session
            </h2>
            <p className="mt-sm text-neutral-600">
              Capture session notes and outcomes just like the central + button.
            </p>
          </Card>
        </Link>
      </div>
    </PageLayout>
  )
}
