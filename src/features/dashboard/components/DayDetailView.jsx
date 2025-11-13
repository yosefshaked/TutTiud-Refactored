import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Dialog, DialogContent } from '@/components/ui/dialog.jsx'
import { Button } from '@/components/ui/button.jsx'
import { fetchDailyCompliance } from '@/api/daily-compliance.js'
import NewSessionModal from '@/features/sessions/components/NewSessionModal.jsx'
import { cn } from '@/lib/utils'
import { buildLegendStyle } from './color-utils.js'

const STATUS_ICON = Object.freeze({
  complete: '✔',
  missing: '✖',
  upcoming: '•',
})

const STATUS_TOKENS = Object.freeze({
  complete: {
    label: 'תיעוד הושלם',
    className: 'text-emerald-600 dark:text-emerald-400',
  },
  missing: {
    label: 'חסר תיעוד',
    className: 'text-red-600 dark:text-red-400',
  },
  upcoming: {
    label: 'מפגש עתידי',
    className: 'text-muted-foreground',
  },
})

function formatHebrewDate(isoDate) {
  if (!isoDate) {
    return ''
  }
  try {
    const formatter = new Intl.DateTimeFormat('he-IL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
    return formatter.format(new Date(`${isoDate}T00:00:00Z`))
  } catch (error) {
    console.error('Failed to format date', error)
    return isoDate
  }
}

function buildSummaryText(summary) {
  if (!summary) {
    return 'אין שיעורים מתוכננים ליום זה.'
  }
  const { totalSessions = 0, documentedSessions = 0 } = summary
  if (!totalSessions) {
    return 'אין שיעורים מתוכננים ליום זה.'
  }
  return `${documentedSessions} תלמידים מתועדים מתוך ${totalSessions} מפגשים`
}

function buildTimeGroups(slots, sessions) {
  if (Array.isArray(slots) && slots.length > 0) {
    return slots.map(slot => ({
      timeMinutes: slot.timeMinutes,
      timeLabel: slot.time,
      sessions: slot.students || [],
    }))
  }

  const fallback = new Map()
  for (const session of sessions || []) {
    const key = session?.timeMinutes ?? session?.time
    if (!fallback.has(key)) {
      fallback.set(key, [])
    }
    fallback.get(key).push(session)
  }

  return Array.from(fallback.entries())
    .sort((a, b) => {
      const minutesA = typeof a[0] === 'number' ? a[0] : parseMinutes(String(a[0]))
      const minutesB = typeof b[0] === 'number' ? b[0] : parseMinutes(String(b[0]))
      return (minutesA || 0) - (minutesB || 0)
    })
    .map(([key, group]) => ({
      timeMinutes: typeof key === 'number' ? key : null,
      timeLabel: typeof key === 'number' ? formatTimeLabel(key) : String(key),
      sessions: group,
    }))
}

function formatTimeLabel(minutes) {
  const value = Number(minutes) || 0
  const hoursPart = Math.floor(value / 60)
  const minutesPart = value % 60
  return `${String(hoursPart).padStart(2, '0')}:${String(minutesPart).padStart(2, '0')}`
}

function parseMinutes(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (!value) {
    return null
  }
  const match = String(value).trim().match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (!match) {
    return null
  }
  const hours = Number.parseInt(match[1], 10)
  const minutes = Number.parseInt(match[2], 10)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null
  }
  return (hours * 60) + minutes
}

export default function DayDetailView({ orgId, date, open, onClose }) {
  const [data, setData] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [refreshToken, setRefreshToken] = useState(0)
  const [quickDocSession, setQuickDocSession] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) {
      return undefined
    }
    if (!orgId || !date) {
      setData(null)
      setError(null)
      return undefined
    }

    const controller = new AbortController()
    let isMounted = true
    setIsLoading(true)
    setError(null)

    fetchDailyCompliance({ orgId, date, signal: controller.signal })
      .then(result => {
        if (!isMounted) {
          return
        }
        setData(result)
      })
      .catch(fetchError => {
        if (fetchError.name === 'AbortError') {
          return
        }
        if (!isMounted) {
          return
        }
        console.error('Failed to load day details', fetchError)
        setError(fetchError)
        setData(null)
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false)
        }
      })

    return () => {
      isMounted = false
      controller.abort()
    }
  }, [orgId, date, open, refreshToken])

  const groups = useMemo(() => buildTimeGroups(data?.timeSlots, data?.sessions), [data?.sessions, data?.timeSlots])
  const summaryText = buildSummaryText(data?.summary)
  const dayLabel = data?.dayLabel || ''
  const hebrewDate = formatHebrewDate(data?.date)

  const closeModal = useCallback(() => {
    onClose?.()
  }, [onClose])

  const handleNavigate = useCallback(studentId => {
    if (!studentId) {
      return
    }
    navigate(`/students/${studentId}`)
    closeModal()
  }, [closeModal, navigate])

  const handleDocumentNow = useCallback(session => {
    if (!session?.studentId) {
      return
    }
    setQuickDocSession({
      studentId: session.studentId,
      date: data?.date || date,
    })
  }, [data?.date, date])

  const handleQuickDocClose = useCallback(() => {
    setQuickDocSession(null)
  }, [])

  const handleQuickDocComplete = useCallback(() => {
    setQuickDocSession(null)
    setRefreshToken(previous => previous + 1)
  }, [])

  const renderStatus = session => {
    const token = STATUS_TOKENS[session?.status] || STATUS_TOKENS.upcoming
    const icon = STATUS_ICON[session?.status] || STATUS_ICON.upcoming
    return (
      <div className="flex items-center gap-xs text-sm">
        <span className={cn('text-base', token.className)} aria-hidden="true">
          {icon}
        </span>
        <span className={token.className}>{token.label}</span>
      </div>
    )
  }

  const renderAction = session => {
    if (!session?.studentId) {
      return null
    }
    if (session.status === 'missing') {
      return (
        <Button type="button" size="sm" onClick={() => handleDocumentNow(session)}>
          תעד עכשיו
        </Button>
      )
    }
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => handleNavigate(session.studentId)}>
        פתח
      </Button>
    )
  }

  return (
    <>
      <Dialog open={open} onOpenChange={value => { if (!value) { closeModal() } }}>
        <DialogContent hideDefaultClose wide className="text-right">
          <div className="-m-4 flex flex-1 sm:-m-6">
            <div className="flex h-full w-full flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-2xl">
              <div className="flex items-start justify-between gap-sm border-b border-border px-xl py-lg">
                <div className="space-y-xs">
                  <p className="text-xs font-semibold text-muted-foreground">תצוגת יום</p>
                  <h2 className="text-2xl font-bold text-foreground">{dayLabel || '—'}</h2>
                  <p className="text-sm text-muted-foreground">{hebrewDate || data?.date || '—'}</p>
                  <p className="text-sm text-foreground">{summaryText}</p>
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border text-lg text-muted-foreground transition hover:bg-muted/50"
                  aria-label="סגירת חלונית היום"
                >
                  ✖
                </button>
              </div>
              <div className="h-[70vh] space-y-lg overflow-y-auto px-xl py-lg" dir="rtl">
                {isLoading ? (
                  <div className="flex justify-center py-lg">
                    <span className="text-sm text-muted-foreground">טוען נתוני יום...</span>
                  </div>
                ) : null}
                {error ? (
                  <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-lg text-destructive">
                    <p className="text-base font-semibold">אירעה שגיאה בטעינת הנתונים.</p>
                    <p className="mt-xs text-sm">נסו לרענן את הדף או לחזור מאוחר יותר.</p>
                  </div>
                ) : null}
                {!isLoading && !error && (!groups || groups.length === 0) ? (
                  <p className="text-sm text-muted-foreground">אין שיעורים להצגה ביום זה.</p>
                ) : null}
                {!isLoading && !error && groups.map(group => (
                  <div key={`${data?.date || date}-${group.timeMinutes ?? group.timeLabel}`} className="space-y-sm">
                    <div className="sticky top-0 z-10 rounded-full bg-muted/40 px-md py-xxs text-xs font-semibold text-muted-foreground">
                      {group.timeLabel || formatTimeLabel(group.timeMinutes)}
                    </div>
                    <div className="space-y-sm">
                      {group.sessions.map(session => (
                        <article
                          key={`${session.studentId}-${session.time}`}
                          className="relative flex flex-col gap-sm rounded-2xl border border-border bg-card/90 p-lg shadow-sm"
                        >
                          <span
                            aria-hidden="true"
                            className="absolute inset-y-0 right-0 w-1 rounded-r-2xl"
                            style={buildLegendStyle(session.instructorColor, { inactive: session.instructorIsActive === false })}
                          />
                          <div className="flex flex-col gap-xs pr-3">
                            <div className="flex flex-col">
                              <span className="text-base font-semibold text-foreground">{session.studentName || '—'}</span>
                              <span className="text-sm text-muted-foreground">{session.instructorName || '—'}</span>
                            </div>
                            {renderStatus(session)}
                          </div>
                          <div className="flex justify-end">{renderAction(session)}</div>
                        </article>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {quickDocSession ? (
        <NewSessionModal
          open={Boolean(quickDocSession)}
          onClose={handleQuickDocClose}
          initialStudentId={quickDocSession.studentId}
          initialDate={quickDocSession.date}
          onCreated={handleQuickDocComplete}
        />
      ) : null}
    </>
  )
}
