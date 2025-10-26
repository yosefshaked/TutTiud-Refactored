import React, { useCallback, useMemo, useState } from "react"
import { Link, NavLink, Outlet } from "react-router-dom"
import { Plus, LayoutDashboard, Users, BarChart3, Settings, LogOut, Megaphone } from "lucide-react"
import { Toaster, toast } from "sonner"

import OrgConfigBanner from "@/components/OrgConfigBanner.jsx"
import OrgSelectionBanner from "@/components/OrgSelectionBanner.jsx"
import ChangelogModal from "@/components/ChangelogModal"
import PageLayout from "@/components/ui/PageLayout.jsx"
import { useAuth } from "@/auth/AuthContext.jsx"
import { useOrg } from "@/org/OrgContext.jsx"
import { cn } from "@/lib/utils"
import NewSessionModal from "@/features/sessions/components/NewSessionModal.jsx"
import { SessionModalContext } from "@/features/sessions/context/SessionModalContext.jsx"

const REPORTS_COMING_SOON_MESSAGE = "יכולות דוחות וסטטיסטיקה יגיעו בקרוב!"

function buildNavItems(role) {
  const normalizedRole = typeof role === "string" ? role.toLowerCase() : "member"
  const isAdminRole = normalizedRole === "admin" || normalizedRole === "owner"

  const studentsDestination = isAdminRole ? "/admin/students" : "/my-students"

  return [
    {
      label: "ראשי",
      to: "/",
      icon: LayoutDashboard,
      end: true,
    },
    {
      label: "תלמידים",
      to: studentsDestination,
      icon: Users,
    },
    {
      label: "דוחות",
      icon: BarChart3,
      disabled: true,
      tooltip: REPORTS_COMING_SOON_MESSAGE,
    },
    {
      label: "הגדרות",
      to: "/Settings",
      icon: Settings,
    },
  ]
}

function LogoPlaceholder() {
  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-lg font-semibold text-primary">
      T
    </div>
  )
}

function MobileNavigation({ navItems = [], onOpenSessionModal }) {
  return (
    <nav
      role="navigation"
      aria-label="ניווט ראשי"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 px-lg pb-sm pt-xs shadow-lg backdrop-blur md:hidden"
    >
      <div className="relative mx-auto flex max-w-md items-center justify-between gap-md">
        {navItems.map((item) => {
          const Icon = item.icon

          if (item.disabled) {
            return (
              <button
                key={item.label}
                type="button"
                aria-label={item.label}
                aria-disabled="true"
                title={item.tooltip}
                onClick={() => toast.info(item.tooltip ?? REPORTS_COMING_SOON_MESSAGE)}
                className="flex flex-1 cursor-not-allowed flex-col items-center gap-1 text-xs font-medium text-neutral-400 opacity-70"
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            )
          }

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
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

        <button
          type="button"
          onClick={() => onOpenSessionModal?.()}
          className="absolute -top-7 left-1/2 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl ring-4 ring-background"
          aria-label="יצירת רישום פגישה חדש"
        >
          <Plus className="h-6 w-6" aria-hidden="true" />
        </button>
      </div>
    </nav>
  )
}

function DesktopNavigation({ navItems = [], onSignOut, onOpenSessionModal }) {
  return (
    <aside
      className="hidden md:flex md:h-screen md:w-72 md:flex-col md:border-l md:border-border md:bg-surface"
      dir="rtl"
    >
      <div className="flex h-full flex-col">
        <div className="flex flex-col gap-md px-lg pt-lg">
          <Link to="/" className="flex items-center justify-end gap-sm text-right">
            <div className="flex items-center justify-center">
              <LogoPlaceholder />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">תותיעוד</p>
              <p className="text-xs text-neutral-500">פלטפורמת תלמידים</p>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => onOpenSessionModal?.()}
            className="inline-flex items-center justify-center gap-sm rounded-full bg-primary px-lg py-sm text-sm font-semibold text-primary-foreground shadow-lg transition hover:shadow-xl"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>רישום מפגש חדש</span>
          </button>
        </div>
        <nav className="mt-md flex-1 space-y-1 px-lg" aria-label="ניווט ראשי">
          {navItems.map((item) => {
            const Icon = item.icon

            if (item.disabled) {
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => toast.info(item.tooltip ?? REPORTS_COMING_SOON_MESSAGE)}
                  className="flex w-full cursor-not-allowed items-center justify-between gap-sm rounded-xl px-md py-sm text-right text-sm font-medium text-neutral-400 opacity-70"
                  aria-disabled="true"
                  title={item.tooltip}
                >
                  <div className="flex items-center gap-sm">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                    <span>{item.label}</span>
                  </div>
                  <Megaphone className="h-4 w-4" aria-hidden="true" />
                </button>
              )
            }

            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
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
        <div className="mt-auto space-y-sm border-t border-border px-lg py-lg">
          <button
            type="button"
            onClick={onSignOut}
            className="flex w-full items-center justify-center gap-sm rounded-xl border border-border px-md py-sm text-sm font-semibold text-neutral-600 transition hover:bg-neutral-100"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            התנתקות
          </button>
        </div>
      </div>
    </aside>
  )
}

export default function AppShell({ children }) {
  const { signOut } = useAuth()
  const { activeOrg } = useOrg()
  const [isChangelogOpen, setIsChangelogOpen] = useState(false)
  const [sessionModalState, setSessionModalState] = useState({
    isOpen: false,
    studentId: '',
    onCreated: null,
  })

  const membershipRole = activeOrg?.membership?.role
  const navItems = useMemo(() => buildNavItems(membershipRole), [membershipRole])

  const openSessionModal = useCallback((options = {}) => {
    const { studentId = '', onCreated = null } = options
    setSessionModalState({
      isOpen: true,
      studentId,
      onCreated: typeof onCreated === 'function' ? onCreated : null,
    })
  }, [])

  const closeSessionModal = useCallback(() => {
    setSessionModalState({
      isOpen: false,
      studentId: '',
      onCreated: null,
    })
  }, [])

  const sessionModalContextValue = useMemo(() => ({
    openSessionModal,
    closeSessionModal,
    isSessionModalOpen: sessionModalState.isOpen,
    sessionModalStudentId: sessionModalState.studentId,
  }), [openSessionModal, closeSessionModal, sessionModalState.isOpen, sessionModalState.studentId])

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
    <SessionModalContext.Provider value={sessionModalContextValue}>
      <div className="flex min-h-screen bg-background text-foreground overflow-x-hidden" dir="rtl">
        <DesktopNavigation navItems={navItems} onSignOut={handleSignOut} onOpenSessionModal={openSessionModal} />

        <div className="relative flex min-h-screen flex-1 flex-col pb-[88px] md:h-screen md:pb-0">
          <header className="sticky top-0 z-20 border-b border-border bg-surface/80 px-sm py-sm backdrop-blur md:border-none md:bg-transparent md:px-md md:py-sm">
            <div className="flex items-center justify-between gap-xs">
              <div className="flex items-center gap-xs sm:gap-sm">
                <LogoPlaceholder />
                <button
                  type="button"
                  onClick={handleOrgClick}
                  className="inline-flex min-h-[44px] items-center rounded-full border border-border bg-surface px-sm py-xs text-xs font-semibold text-foreground transition hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:px-md sm:text-sm"
                >
                  {activeOrg?.name ? `ארגון: ${activeOrg.name}` : "בחרו ארגון לעבודה"}
                </button>
              </div>
              <div className="flex items-center gap-xs">
                <button
                  type="button"
                  onClick={() => setIsChangelogOpen(true)}
                  className="inline-flex min-h-[44px] items-center gap-1 rounded-full border border-border px-xs py-xs text-xs font-medium text-neutral-600 transition hover:bg-neutral-100 sm:px-sm"
                >
                  <Megaphone className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">עדכונים</span>
                </button>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-neutral-100 p-2 text-neutral-600 transition hover:bg-neutral-200"
                  aria-label="התנתקות"
                >
                  <LogOut className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </header>

          <OrgSelectionBanner />
          <OrgConfigBanner />

          <div className="flex-1 overflow-y-auto overflow-x-hidden">
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
        <MobileNavigation navItems={navItems} onOpenSessionModal={openSessionModal} />

        <ChangelogModal open={isChangelogOpen} onClose={() => setIsChangelogOpen(false)} />
        <Toaster richColors position="top-right" closeButton />
        <NewSessionModal
          open={sessionModalState.isOpen}
          onClose={closeSessionModal}
          initialStudentId={sessionModalState.studentId}
          onCreated={sessionModalState.onCreated}
        />
      </div>
    </SessionModalContext.Provider>
  )
}
