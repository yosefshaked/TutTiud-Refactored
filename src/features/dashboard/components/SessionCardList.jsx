import React, { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { buildChipStyle, normalizeColorIdentifier } from './color-utils.js'

const STATUS_META = Object.freeze({
  complete: {
    icon: '✔',
    label: 'תיעוד הושלם',
    className: 'text-emerald-100',
  },
  missing: {
    icon: '✖',
    label: 'חסר תיעוד',
    className: 'text-red-100',
  },
  upcoming: {
    icon: '•',
    label: 'מפגש עתידי',
    className: 'text-white/80',
  },
})

function toMinutes(value) {
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
  const seconds = match[3] ? Number.parseInt(match[3], 10) : 0
  if (Number.isNaN(hours) || Number.isNaN(minutes) || Number.isNaN(seconds)) {
    return null
  }
  return hours * 60 + minutes + Math.floor(seconds / 60)
}

function formatTimeLabel(minutes) {
  if (!Number.isFinite(minutes)) {
    return ''
  }
  const hoursPart = Math.floor(minutes / 60)
  const minutesPart = minutes % 60
  return `${String(hoursPart).padStart(2, '0')}:${String(minutesPart).padStart(2, '0')}`
}

function normalizeSlots({ sessions, timeSlots }) {
  const fallbackSessions = Array.isArray(sessions) ? sessions : []
  const slots = Array.isArray(timeSlots) ? timeSlots : []

  if (slots.length) {
    return slots
      .map(slot => {
        const timeMinutes = typeof slot.timeMinutes === 'number' ? slot.timeMinutes : toMinutes(slot.time)
        const timeLabel = slot.time || formatTimeLabel(timeMinutes)
        return {
          timeMinutes,
          timeLabel,
          sessions: Array.isArray(slot.students) ? slot.students : [],
        }
      })
      .filter(slot => slot.sessions.length)
      .sort((a, b) => (a.timeMinutes ?? 0) - (b.timeMinutes ?? 0))
  }

  const grouped = new Map()
  for (const session of fallbackSessions) {
    const timeMinutes = typeof session?.timeMinutes === 'number' ? session.timeMinutes : toMinutes(session?.time)
    const timeLabel = session?.time || formatTimeLabel(timeMinutes)
    const key = Number.isFinite(timeMinutes) ? timeMinutes : timeLabel
    if (!grouped.has(key)) {
      grouped.set(key, { timeMinutes, timeLabel, sessions: [] })
    }
    grouped.get(key).sessions.push(session)
  }

  return Array.from(grouped.values()).sort((a, b) => (a.timeMinutes ?? 0) - (b.timeMinutes ?? 0))
}

function buildHourGroups(slots) {
  if (!slots.length) {
    return []
  }
  const minuteValues = slots.map(slot => slot.timeMinutes ?? 0)
  const minMinute = Math.floor(Math.min(...minuteValues) / 60) * 60
  const maxMinute = Math.max(...minuteValues)
  const endMinute = Math.ceil((maxMinute + 1) / 60) * 60
  const groups = []

  for (let minute = minMinute; minute <= endMinute; minute += 60) {
    const label = `${String(Math.floor(minute / 60)).padStart(2, '0')}:00`
    const hourSlots = slots.filter(slot => {
      const slotMinute = slot.timeMinutes ?? 0
      return slotMinute >= minute && slotMinute < minute + 60
    })
    groups.push({ label, slots: hourSlots })
  }

  return groups
}

function buildBarStyle(identifier) {
  const colors = normalizeColorIdentifier(identifier)
  if (!colors.length) {
    return { backgroundColor: '#6B7280' }
  }
  if (colors.length === 1) {
    return { backgroundColor: colors[0] }
  }
  return { backgroundImage: `linear-gradient(135deg, ${colors.join(', ')})` }
}

export default function SessionCardList({
  sessions,
  timeSlots,
  onOpenStudent,
  onDocumentNow,
  emptyMessage = 'אין שיעורים מתוכננים ליום זה.',
  className = '',
}) {
  const normalizedSlots = useMemo(() => normalizeSlots({ sessions, timeSlots }), [sessions, timeSlots])
  const hourGroups = useMemo(() => buildHourGroups(normalizedSlots), [normalizedSlots])

  if (!normalizedSlots.length) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>
  }

  return (
    <div className={cn('relative space-y-8', className)} dir="rtl">
      <div className="absolute right-[64px] top-0 bottom-0 w-px bg-border" aria-hidden />
      {hourGroups.map(hour => (
        <section key={hour.label} className="grid grid-cols-[70px,1fr] gap-4">
          <div className="mt-1 text-sm font-semibold text-muted-foreground">{hour.label}</div>
          <div className="space-y-4">
            {hour.slots.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/60 px-4 py-3 text-xs text-muted-foreground">
                אין שיעורים בשעה זו
              </div>
            ) : (
              hour.slots.map(slot => (
                <div key={`${hour.label}-${slot.timeLabel}`} className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">{slot.timeLabel}</p>
                  <div className="space-y-3">
                    {slot.sessions.map(session => {
                      const status = STATUS_META[session?.status] || STATUS_META.upcoming
                      const chipStyle = buildChipStyle(session?.instructorColor, {
                        inactive: session?.instructorIsActive === false,
                      })
                      const barStyle = buildBarStyle(session?.instructorColor)
                      return (
                        <article
                          key={`${slot.timeLabel}-${session?.studentId}-${session?.id || ''}`}
                          className="relative overflow-hidden rounded-2xl p-4 text-white shadow-sm"
                          style={chipStyle}
                        >
                          <div className="absolute left-0 top-0 bottom-0 w-1.5" style={barStyle} aria-hidden />
                          <div className="space-y-3 pl-2">
                            <div className="flex flex-col items-start gap-1 text-right">
                              <p className="text-base font-semibold">{session?.studentName || '—'}</p>
                              <p className="text-xs text-white/80">{session?.instructorName || '—'}</p>
                            </div>
                            <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                              <span className={`text-lg font-bold ${status.className}`} aria-label={status.label}>
                                {status.icon}
                              </span>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  className="border-white/30 bg-white/10 text-white hover:bg-white/20"
                                  onClick={() => onOpenStudent?.(session)}
                                >
                                  פתח
                                </Button>
                                {session?.status === 'missing' && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="bg-white text-primary hover:bg-white/90"
                                    onClick={() => onDocumentNow?.(session)}
                                  >
                                    תעד עכשיו
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      ))}
    </div>
  )
}
