import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import Card from '@/components/ui/CustomCard.jsx'
import { Button } from '@/components/ui/button.jsx'
import { fetchWeeklyComplianceView } from '@/api/weekly-compliance.js'

const STATUS_ICONS = {
  complete: '✔',
  missing: '✖',
}

const HEBREW_DAY_LABELS = Object.freeze({
  1: 'יום ראשון',
  2: 'יום שני',
  3: 'יום שלישי',
  4: 'יום רביעי',
  5: 'יום חמישי',
  6: 'יום שישי',
  7: 'יום שבת',
})

const ENGLISH_DAY_TO_INDEX = Object.freeze({
  Sunday: 1,
  Monday: 2,
  Tuesday: 3,
  Wednesday: 4,
  Thursday: 5,
  Friday: 6,
  Saturday: 7,
})

function formatTimeLabel(minutes) {
  const value = Number(minutes) || 0
  const hoursPart = Math.floor(value / 60)
  const minutesPart = value % 60
  return `${String(hoursPart).padStart(2, '0')}:${String(minutesPart).padStart(2, '0')}`
}

function startOfUtcDay(dateLike) {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike)
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function startOfUtcWeek(dateLike) {
  const start = startOfUtcDay(dateLike)
  const day = start.getUTCDay()
  start.setUTCDate(start.getUTCDate() - day)
  return start
}

function addDaysUtc(dateLike, days) {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike)
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

function formatUtcDate(dateLike) {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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
  return hours * 60 + minutes
}

function resolveHebrewDayLabel(dayOfWeek, fallbackLabel) {
  const numericDay = Number.parseInt(dayOfWeek, 10)
  if (numericDay && HEBREW_DAY_LABELS[numericDay]) {
    return HEBREW_DAY_LABELS[numericDay]
  }

  const normalizedFallback = typeof fallbackLabel === 'string' ? fallbackLabel.trim() : ''
  if (normalizedFallback && ENGLISH_DAY_TO_INDEX[normalizedFallback]) {
    const index = ENGLISH_DAY_TO_INDEX[normalizedFallback]
    if (HEBREW_DAY_LABELS[index]) {
      return HEBREW_DAY_LABELS[index]
    }
  }

  return normalizedFallback || ''
}

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

function buildDayDisplay(day) {
  if (!day) {
    return { label: '', date: '' }
  }

  const label = resolveHebrewDayLabel(day.dayOfWeek, day.label)
  const date = formatHebrewDate(day.date)

  return {
    label: label || '',
    date: date || '',
  }
}

function buildChipStyle(identifier) {
  if (!identifier || typeof identifier !== 'string') {
    return {}
  }
  const parts = identifier.split(',').map(token => token.trim()).filter(Boolean)
  if (!parts.length) {
    return {}
  }
  if (parts.length === 1) {
    return { backgroundColor: parts[0], color: 'white' }
  }
  return {
    backgroundImage: `linear-gradient(135deg, ${parts.join(', ')})`,
    color: 'white',
  }
}

function buildLegendStyle(identifier) {
  if (!identifier) {
    return { backgroundColor: '#6B7280' }
  }
  const parts = identifier.split(',').map(token => token.trim()).filter(Boolean)
  if (!parts.length) {
    return { backgroundColor: '#6B7280' }
  }
  if (parts.length === 1) {
    return { backgroundColor: parts[0] }
  }
  return {
    backgroundImage: `linear-gradient(135deg, ${parts.join(', ')})`,
  }
}

function groupSessionsByTime(day, slots) {
  const map = new Map()
  if (!Array.isArray(slots) || !slots.length) {
    return map
  }
  const slotSet = new Set(slots)
  for (const slot of slots) {
    map.set(slot, [])
  }
  for (const session of day?.sessions || []) {
    const key = parseMinutes(session.timeMinutes ?? session.time)
    if (key === null || !slotSet.has(key)) {
      continue
    }
    map.get(key)?.push(session)
  }
  return map
}

function useInitialWeekStart() {
  return useMemo(() => formatUtcDate(startOfUtcWeek(new Date())), [])
}

export default function WeeklyComplianceView({ orgId }) {
  const navigate = useNavigate()
  const initialWeekStart = useInitialWeekStart()
  const [weekStart, setWeekStart] = useState(initialWeekStart)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [mobileDayIndex, setMobileDayIndex] = useState(0)

  useEffect(() => {
    if (!orgId || !weekStart) {
      setData(null)
      return
    }

    const controller = new AbortController()
    let isMounted = true
    setIsLoading(true)
    setError(null)

    fetchWeeklyComplianceView({ orgId, weekStart, signal: controller.signal })
      .then(response => {
        if (!isMounted) {
          return
        }
        setData(response)
      })
      .catch(fetchError => {
        if (fetchError.name === 'AbortError') {
          return
        }
        if (!isMounted) {
          return
        }
        console.error('Failed to load weekly compliance data', fetchError)
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
  }, [orgId, weekStart])

  useEffect(() => {
    if (!data?.days?.length) {
      setMobileDayIndex(0)
      return
    }

    const todayIndex = data.days.findIndex(day => day.date === data.today)
    if (todayIndex >= 0) {
      setMobileDayIndex(todayIndex)
      return
    }

    setMobileDayIndex(0)
  }, [data?.days, data?.today])

  const timeSlots = useMemo(() => {
    const window = data?.timeWindow
    if (!window) {
      return []
    }
    const start = parseMinutes(window.startMinutes ?? window.start)
    const end = parseMinutes(window.endMinutes ?? window.end)
    const interval = Number(window.intervalMinutes) || 15
    if (start === null || end === null || end < start) {
      return []
    }
    const slots = []
    for (let minutes = start; minutes <= end; minutes += interval) {
      slots.push(minutes)
    }
    return slots
  }, [data?.timeWindow])

  const legend = data?.legend || []
  const daysSource = data?.days
  const days = useMemo(() => (Array.isArray(daysSource) ? daysSource : []), [daysSource])
  const daySessionMaps = useMemo(() => {
    const maps = new Map()
    for (const day of days) {
      maps.set(day.date, groupSessionsByTime(day, timeSlots))
    }
    return maps
  }, [days, timeSlots])
  const selectedDay = days[mobileDayIndex] || days[0]
  const selectedDayDisplay = useMemo(() => buildDayDisplay(selectedDay), [selectedDay])
  const isCurrentWeek = weekStart === initialWeekStart

  const handlePreviousWeek = useCallback(() => {
    const current = startOfUtcWeek(`${weekStart}T00:00:00Z`)
    const previous = addDaysUtc(current, -7)
    setWeekStart(formatUtcDate(previous))
  }, [weekStart])

  const handleNextWeek = useCallback(() => {
    const current = startOfUtcWeek(`${weekStart}T00:00:00Z`)
    const next = addDaysUtc(current, 7)
    setWeekStart(formatUtcDate(next))
  }, [weekStart])

  const handleToday = useCallback(() => {
    setWeekStart(initialWeekStart)
  }, [initialWeekStart])

  const handleChipClick = useCallback(studentId => {
    if (!studentId) {
      return
    }
    navigate(`/students/${studentId}`)
  }, [navigate])

  return (
    <Card className="rounded-2xl border border-border bg-surface p-lg shadow-sm">
      <div className="mb-lg flex flex-col gap-md md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">תצוגת ציות שבועית</h2>
          <p className="mt-xs text-sm text-muted-foreground">
            מעקב חזותי אחר השיעורים המתוכננים והסטטוס של התיעוד שלהם.
          </p>
          {data?.weekStart && data?.weekEnd ? (
            <p className="mt-xs text-sm text-muted-foreground">
              שבוע החל ב-{formatHebrewDate(data.weekStart) || '—'} • מסתיים ב-{formatHebrewDate(data.weekEnd) || '—'}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-sm">
          <Button type="button" variant="outline" onClick={handlePreviousWeek} aria-label="שבוע קודם">
            ‹
          </Button>
          <Button type="button" variant="outline" onClick={handleToday} disabled={isCurrentWeek}>
            היום
          </Button>
          <Button type="button" variant="outline" onClick={handleNextWeek} aria-label="שבוע הבא">
            ›
          </Button>
        </div>
      </div>

      <div className="mb-lg flex flex-wrap gap-sm">
        {legend.map(item => (
          <div key={item.id} className="flex items-center gap-xs text-sm text-muted-foreground">
            <span
              aria-hidden="true"
              className="inline-block h-3 w-3 rounded-full border border-border"
              style={buildLegendStyle(item.color)}
            />
            <span>{item.name}</span>
          </div>
        ))}
        {!legend.length && !isLoading && (
          <p className="text-sm text-muted-foreground">אין מדריכים להצגה בשבוע זה.</p>
        )}
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground">טוען נתונים...</p>
      )}
      {error && (
        <p className="text-sm text-destructive">אירעה שגיאה בטעינת לוח הציות. אנא נסו שוב מאוחר יותר.</p>
      )}

      {!isLoading && !error && (!days.length || !timeSlots.length) && (
        <p className="text-sm text-muted-foreground">אין מפגשים מתוכננים לשבוע זה.</p>
      )}

      {!isLoading && !error && days.length > 0 && timeSlots.length > 0 && (
        <>
          <div className="hidden md:block">
            <div className="grid" style={{ gridTemplateColumns: `minmax(80px, 120px) repeat(${days.length}, minmax(0, 1fr))` }}>
              <div className="sticky top-0 bg-surface font-semibold text-muted-foreground" />
              {days.map(day => {
                const display = buildDayDisplay(day)
                return (
                  <div
                    key={day.date}
                    className="border-b border-border bg-muted/30 px-sm py-xs text-center text-sm font-medium text-foreground"
                  >
                    <span className="block text-base font-semibold">{display.label || '—'}</span>
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">{display.date || '—'}</span>
                  </div>
                )
              })}
              {timeSlots.map(minutes => {
                const label = formatTimeLabel(minutes)
                return (
                  <React.Fragment key={minutes}>
                    <div className="border-b border-border px-sm py-sm text-sm font-medium text-muted-foreground">
                      {label}
                    </div>
                    {days.map(day => {
                      const sessionMap = daySessionMaps.get(day.date) || new Map()
                      const sessionsAtSlot = sessionMap.get(minutes) || []
                      return (
                        <div key={`${day.date}-${minutes}`} className="border-b border-l border-border px-sm py-xs align-top">
                          <div className="flex flex-col gap-xs">
                            {sessionsAtSlot.map(session => {
                              const statusIcon = STATUS_ICONS[session.status]
                              return (
                                <button
                                  key={`${session.studentId}-${session.time}`}
                                  type="button"
                                  onClick={() => handleChipClick(session.studentId)}
                                  className="flex items-center justify-between gap-xs rounded-full px-sm py-xs text-xs font-medium text-white shadow-sm transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                                  style={buildChipStyle(session.instructorColor)}
                                >
                                  <span className="truncate" title={`${session.studentName} • ${session.instructorName}`}>
                                    {session.studentName || '—'}
                                  </span>
                                  {statusIcon ? (
                                    <span className="text-base" aria-hidden="true">{statusIcon}</span>
                                  ) : null}
                                  <span className="sr-only">
                                    {session.status === 'complete' && 'תיעוד הושלם'}
                                    {session.status === 'missing' && 'תיעוד חסר'}
                                    {session.status === 'upcoming' && 'תיעוד עתידי'}
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </React.Fragment>
                )
              })}
            </div>
          </div>

          <div className="md:hidden">
            <div className="mb-sm flex gap-sm overflow-x-auto pb-sm">
              {days.map((day, index) => {
                const display = buildDayDisplay(day)
                return (
                  <Button
                    key={day.date}
                    type="button"
                    size="sm"
                    variant={index === mobileDayIndex ? 'default' : 'outline'}
                    onClick={() => setMobileDayIndex(index)}
                    className="flex-col gap-0 text-center leading-tight"
                  >
                    <span className="text-sm font-semibold">{display.label || '—'}</span>
                    <span className="text-xs font-normal text-muted-foreground">{display.date || '—'}</span>
                  </Button>
                )
              })}
            </div>
            <div>
              <h3 className="mb-sm text-lg font-semibold text-foreground leading-snug">
                <span className="block">{selectedDayDisplay.label || '—'}</span>
                <span className="mt-1 block text-sm font-normal text-muted-foreground">
                  {selectedDayDisplay.date || '—'}
                </span>
              </h3>
              <div className="space-y-xs">
                {timeSlots.map(minutes => {
                  const label = formatTimeLabel(minutes)
                  const sessionMap = selectedDay ? daySessionMaps.get(selectedDay.date) || new Map() : new Map()
                  const sessionsAtSlot = sessionMap.get(minutes) || []
                  return (
                    <div key={`${selectedDay?.date}-${minutes}`} className="rounded-lg border border-border p-sm">
                      <p className="mb-xs text-sm font-medium text-muted-foreground">{label}</p>
                      <div className="flex flex-col gap-xs">
                        {sessionsAtSlot.length === 0 ? (
                          <span className="text-xs text-muted-foreground">אין תלמידים בזמן זה.</span>
                        ) : (
                          sessionsAtSlot.map(session => {
                            const statusIcon = STATUS_ICONS[session.status]
                            return (
                              <button
                                key={`${session.studentId}-${session.time}`}
                                type="button"
                                onClick={() => handleChipClick(session.studentId)}
                                className="flex items-center justify-between gap-xs rounded-full px-sm py-xs text-xs font-medium text-white shadow-sm transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                                style={buildChipStyle(session.instructorColor)}
                              >
                                <span className="truncate" title={`${session.studentName} • ${session.instructorName}`}>
                                  {session.studentName || '—'}
                                </span>
                                {statusIcon ? (
                                  <span className="text-base" aria-hidden="true">{statusIcon}</span>
                                ) : null}
                                <span className="sr-only">
                                  {session.status === 'complete' && 'תיעוד הושלם'}
                                  {session.status === 'missing' && 'תיעוד חסר'}
                                  {session.status === 'upcoming' && 'תיעוד עתידי'}
                                </span>
                              </button>
                            )
                          })
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </Card>
  )
}
