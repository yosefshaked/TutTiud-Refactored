import React, { useState } from "react"
import { Link, NavLink, Outlet } from "react-router-dom"
import { Plus, LayoutDashboard, Users, BarChart3, Settings, LogOut, Megaphone } from "lucide-react"
import { Toaster, toast } from "sonner"

import OrgConfigBanner from "@/components/OrgConfigBanner.jsx"
import OrgSelectionBanner from "@/components/OrgSelectionBanner.jsx"
import ChangelogModal from "@/components/ChangelogModal"
import PageLayout from "@/components/ui/PageLayout.jsx"
import { useAuth } from "@/auth/AuthContext.jsx"
import { useOrg } from "@/org/OrgContext.jsx"
import OrgSwitcher from "@/org/OrgSwitcher.jsx"
import { cn } from "@/lib/utils"

const navItems = [
  {
    label: "ראשי",
    to: "/Dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "תלמידים",
    to: "/admin/students",
    icon: Users,
  },
  {
    label: "דוחות",
    to: "/Reports",
    icon: BarChart3,
  },
  {
    label: "הגדרות",
    to: "/Settings",
    icon: Settings,
  },
]

function LogoPlaceholder() {
  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-lg font-semibold text-primary">
      T
    </div>
  )
}

function MobileNavigation() {
  return (
    <nav
      role="navigation"
      aria-label="ניווט ראשי"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 px-lg pb-sm pt-xs shadow-lg backdrop-blur md:hidden"
    >
      <div className="relative mx-auto flex max-w-md items-center justify-between gap-md">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              aria-label={item.label}
              className={({ isActive }) =>
                cn(
                  "flex flex-1 flex-col items-center gap-1 text-xs font-medium",
                  isActive ? "text-primary" : "text-neutral-500",
                )
              }
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span>{item.label}</span>
            </NavLink>
          )
        })}

        <Link
          to="/TimeEntry"
          className="absolute -top-7 left-1/2 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl ring-4 ring-background"
          aria-label="יצירת רישום פגישה חדש"
        >
          <Plus className="h-6 w-6" aria-hidden="true" />
        </Link>
      </div>
    </nav>
  )
}

function DesktopNavigation({ onSignOut }) {
  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:border-l md:border-border md:bg-surface" dir="rtl">
      <div className="flex flex-col gap-md px-lg py-lg">
        <div className="flex justify-end">
          <LogoPlaceholder />
        </div>
        <Link to="/Dashboard" className="text-right">
          <p className="text-xs text-neutral-500">פלטפורמת TutTiud</p>
          <p className="text-title-sm font-semibold text-foreground">ניהול תלמידים</p>
        </Link>
        <Link
          to="/TimeEntry"
          className="inline-flex items-center justify-center gap-sm rounded-full bg-primary px-lg py-sm text-sm font-semibold text-primary-foreground shadow-lg transition hover:shadow-xl"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>רישום מפגש חדש</span>
        </Link>
      </div>
      <nav className="flex-1 space-y-1 px-md" aria-label="ניווט ראשי">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex items-center justify-between gap-sm rounded-xl px-md py-sm text-sm font-medium transition",
                  isActive ? "bg-primary/10 text-primary" : "text-neutral-600 hover:bg-neutral-100",
                )
              }
            >
              <div className="flex items-center gap-sm">
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span>{item.label}</span>
              </div>
            </NavLink>
          )
        })}
      </nav>
      <div className="space-y-sm border-t border-border px-lg py-lg">
        <OrgSwitcher />
        <button
          type="button"
          onClick={onSignOut}
          className="flex w-full items-center justify-center gap-sm rounded-xl border border-border px-md py-sm text-sm font-semibold text-neutral-600 transition hover:bg-neutral-100"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          התנתקות
        </button>
      </div>
    </aside>
  )
}

export default function AppShell({ children }) {
  const { signOut } = useAuth()
  const { activeOrg } = useOrg()
  const [isChangelogOpen, setIsChangelogOpen] = useState(false)

  const handleOrgClick = () => {
    toast.info("בקרוב: בחירת ארגון נוסף")
  }

  const handleSignOut = async () => {
    try {
      await signOut()
      toast.success("התנתקת בהצלחה")
    } catch (error) {
      console.error("Sign-out failed", error)
      toast.error("אירעה שגיאה בהתנתקות. נסה שוב.")
    }
  }

  const content = children ?? <Outlet />

  return (
    <div className="flex min-h-screen bg-background text-foreground" dir="rtl">
      <DesktopNavigation onSignOut={handleSignOut} />

      <div className="relative flex min-h-screen flex-1 flex-col pb-[88px] md:pb-0">
        <header className="sticky top-0 z-20 border-b border-border bg-surface/80 px-md py-sm backdrop-blur md:border-none md:bg-transparent md:px-lg">
          <div className="flex items-center justify-between gap-sm">
            <div className="flex items-center gap-sm">
              <LogoPlaceholder />
              <button
                type="button"
                onClick={handleOrgClick}
                className="inline-flex items-center rounded-full border border-border bg-surface px-md py-xs text-sm font-semibold text-foreground transition hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                {activeOrg?.name ? `ארגון: ${activeOrg.name}` : "בחרו ארגון לעבודה"}
              </button>
            </div>
            <div className="flex items-center gap-xs">
              <button
                type="button"
                onClick={() => setIsChangelogOpen(true)}
                className="inline-flex items-center gap-1 rounded-full border border-border px-sm py-xs text-xs font-medium text-neutral-600 transition hover:bg-neutral-100"
              >
                <Megaphone className="h-3.5 w-3.5" aria-hidden="true" />
                עדכונים
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex items-center justify-center rounded-full bg-neutral-100 p-2 text-neutral-600 transition hover:bg-neutral-200"
                aria-label="התנתקות"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </header>

        <div className="border-b border-border px-md py-sm md:hidden">
          <OrgSwitcher />
        </div>

        <OrgSelectionBanner />
        <OrgConfigBanner />

        <div className="flex-1 overflow-y-auto">
          <PageLayout
            fullHeight={false}
            className="min-h-full pb-0"
            contentClassName="pb-xl"
            headerClassName="pb-sm"
          >
            {content}
          </PageLayout>
        </div>
      </div>

      <MobileNavigation />

      <ChangelogModal open={isChangelogOpen} onClose={() => setIsChangelogOpen(false)} />
      <Toaster richColors position="top-right" closeButton />
    </div>
  )
}
