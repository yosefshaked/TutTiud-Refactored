import React, { useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog.jsx'
import { buildChipStyle } from './color-utils.js'

const STATUS_INFO = Object.freeze({
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

function formatFullHebrewDate(isoDate) {
  if (!isoDate) {
    return ''
  }
  try {
    const formatter = new Intl.DateTimeFormat('he-IL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    return formatter.format(new Date(`${isoDate}T00:00:00Z`))
  } catch {
    return isoDate
  }
}

function buildSummary(summary) {
  if (!summary || !summary.totalSessions) {
    return ''
  }
  const documented = summary.documentedSessions || 0
  return `${documented} תלמידים מתועדים מתוך ${summary.totalSessions} מפגשים`
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

function formatTimeLabel(minutes) {
  if (!Number.isFinite(minutes)) {
    return ''
  }
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

function normalizeSlots(dayData) {
  const slots = Array.isArray(dayData?.timeSlots) ? dayData.timeSlots : []
  const sessions = Array.isArray(dayData?.sessions) ? dayData.sessions : []

  if (slots.length > 0) {
    return slots
      .map(slot => {
        const timeMinutes = typeof slot.timeMinutes === 'number' ? slot.timeMinutes : parseMinutes(slot.time)
        const timeLabel = slot.time || formatTimeLabel(timeMinutes)
        const slotSessions = Array.isArray(slot.students) ? slot.students : []
        return {
          timeMinutes,
          timeLabel,
          sessions: slotSessions,
        }
      })
      .filter(slot => slot.sessions.length > 0)
      .sort((a, b) => (a.timeMinutes ?? 0) - (b.timeMinutes ?? 0))
  }

  const map = new Map()
  for (const session of sessions) {
    const timeMinutes = typeof session?.timeMinutes === 'number' ? session.timeMinutes : parseMinutes(session?.time)
    const timeLabel = session?.time || formatTimeLabel(timeMinutes)
    const key = Number.isFinite(timeMinutes) ? timeMinutes : timeLabel
    if (!map.has(key)) {
      map.set(key, { timeMinutes, timeLabel, sessions: [] })
    }
    map.get(key).sessions.push(session)
  }

  return Array.from(map.values()).sort((a, b) => (a.timeMinutes ?? 0) - (b.timeMinutes ?? 0))
}

function buildHourGroups(slots) {
  if (!slots.length) {
    return []
  }
  const minuteValues = slots.map(slot => slot.timeMinutes ?? 0)
  const minMinute = Math.floor(Math.min(...minuteValues) / 60) * 60
  const endMinute = Math.ceil((Math.max(...minuteValues) + 1) / 60) * 60
  const groups = []

  for (let minute = minMinute; minute < endMinute; minute += 60) {
    const label = `${String(Math.floor(minute / 60)).padStart(2, '0')}:00`
    const hourSlots = slots.filter(slot => {
      const slotMinute = slot.timeMinutes ?? 0
      return slotMinute >= minute && slotMinute < minute + 60
    })
    groups.push({ label, slots: hourSlots })
  }

  return groups
}

export default function DayDetailView({ dayData, onClose }) {
  const slots = useMemo(() => normalizeSlots(dayData), [dayData])
  const hours = useMemo(() => buildHourGroups(slots), [slots])
  const fullDate = formatFullHebrewDate(dayData?.date)
  const summaryText = buildSummary(dayData?.summary)

  return (
    <Dialog open onOpenChange={value => { if (!value) { onClose?.() } }}>
      <DialogContent wide className="text-right">
        <DialogHeader>
          <p className="text-sm text-muted-foreground">תצוגת יום מפורטת</p>
          <DialogTitle className="text-2xl font-bold text-foreground">
            {fullDate || dayData?.dayLabel || '—'}
          </DialogTitle>
          {summaryText ? (
            <p className="text-sm text-muted-foreground">{summaryText}</p>
          ) : null}
        </DialogHeader>
        {hours.length === 0 ? (
          <p className="text-sm text-muted-foreground">אין שיעורים מתוכננים ליום זה.</p>
        ) : (
          <div className="relative space-y-8">
            <div className="absolute right-[64px] top-0 bottom-0 w-px bg-border" aria-hidden="true" />
            {hours.map(hour => (
              <section key={hour.label} className="grid grid-cols-[70px,1fr] gap-4">
                <div className="text-sm font-semibold text-muted-foreground mt-1">{hour.label}</div>
                <div className="space-y-4">
                  {hour.slots.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/60 px-4 py-3 text-xs text-muted-foreground">
                      אין שיעורים בשעה זו
                    </div>
                  ) : (
                    hour.slots.map(slot => (
                      <div key={`${hour.label}-${slot.timeLabel}`} className="space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground">{slot.timeLabel}</p>
                        <div className="space-y-2">
                          {slot.sessions.map(session => {
                            const token = STATUS_INFO[session?.status] || STATUS_INFO.upcoming
                            const style = buildChipStyle(session?.instructorColor, {
                              inactive: session?.instructorIsActive === false,
                            })
                            return (
                              <article
                                key={`${slot.timeLabel}-${session?.studentId}`}
                                className="rounded-2xl p-4 shadow-sm text-white"
                                style={style}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="space-y-1">
                                    <p className="text-base font-semibold">{session?.studentName || '—'}</p>
                                    <p className="text-xs text-white/80">{session?.instructorName || '—'}</p>
                                  </div>
                                  <span className={`text-lg font-bold ${token.className}`} aria-label={token.label}>
                                    {token.icon}
                                  </span>
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
        )}
      </DialogContent>
    </Dialog>
  )
}
