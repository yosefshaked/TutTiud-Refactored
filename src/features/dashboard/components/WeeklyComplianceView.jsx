import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useNavigate } from 'react-router-dom'

import Card from '@/components/ui/CustomCard.jsx'
import { Button } from '@/components/ui/button.jsx'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.jsx'
import { fetchWeeklyComplianceView } from '@/api/weekly-compliance.js'
import { cn } from '@/lib/utils'

import { buildChipStyle } from './color-utils.js'

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

const GRID_INTERVAL_MINUTES = 30
const SESSION_DURATION_MINUTES = 30
const GRID_ROW_HEIGHT = 44
const COLUMN_GAP_PX = 6
const MAX_VISIBLE_CHIPS = 2
const WEEK_VIEW_MIN_WIDTH = 1015
const OVERFLOW_BADGE_HEIGHT = 32
const OVERFLOW_BADGE_VERTICAL_GAP = 4

function formatTimeLabel(minutes) {
  const value = Number(minutes) || 0
  const hoursPart = Math.floor(value / 60)
  const minutesPart = value % 60
  return `${String(hoursPart).padStart(2, '0')}:${String(minutesPart).padStart(2, '0')}`
}

function formatLocalDateIso(dateLike) {
  const date = dateLike instanceof Date ? new Date(dateLike) : new Date(dateLike)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function startOfLocalWeek(dateLike) {
  const date = dateLike instanceof Date ? new Date(dateLike) : new Date(dateLike)
  if (Number.isNaN(date.getTime())) {
    return new Date()
  }
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  const day = result.getDay()
  result.setDate(result.getDate() - day)
  return result
}

function parseIsoToLocalDate(isoDate) {
  if (typeof isoDate !== 'string') {
    return null
  }
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) {
    return null
  }
  const year = Number.parseInt(match[1], 10)
  const month = Number.parseInt(match[2], 10) - 1
  const day = Number.parseInt(match[3], 10)
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    return null
  }
  return new Date(year, month, day)
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

function createGridSlots(window) {
  if (!window) {
    return []
  }
  const start = parseMinutes(window.startMinutes ?? window.start)
  const end = parseMinutes(window.endMinutes ?? window.end)
  if (start === null || end === null || end <= start) {
    return []
  }
  const slots = []
  for (let minutes = start; minutes <= end; minutes += GRID_INTERVAL_MINUTES) {
    slots.push(minutes)
  }
  return slots
}

function resolveMobileSlot(minutes, slots) {
  if (!Array.isArray(slots) || !slots.length || minutes === null) {
    return null
  }
  const sorted = [...slots].sort((a, b) => a - b)
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    if (minutes >= sorted[index]) {
      return sorted[index]
    }
  }
  return sorted[0]
}

function groupSessionsForMobile(day, slots) {
  const map = new Map()
  if (!Array.isArray(slots) || !slots.length) {
    return map
  }
  for (const slot of slots) {
    map.set(slot, [])
  }
  for (const session of day?.sessions || []) {
    const timeMinutes = Number(session?.timeMinutes ?? parseMinutes(session?.time))
    if (!Number.isFinite(timeMinutes)) {
      continue
    }
    const slot = resolveMobileSlot(timeMinutes, slots)
    if (slot === null) {
      continue
    }
    const bucket = map.get(slot)
    if (bucket) {
      bucket.push(session)
    }
  }
  for (const list of map.values()) {
    list.sort((a, b) => {
      if (a.timeMinutes !== b.timeMinutes) {
        return a.timeMinutes - b.timeMinutes
      }
      return (a.studentName || '').localeCompare(b.studentName || '', 'he')
    })
  }
  return map
}

function useInitialWeekStart(localTodayIso) {
  return useMemo(() => {
    const base = parseIsoToLocalDate(localTodayIso) || new Date()
    return formatLocalDateIso(startOfLocalWeek(base))
  }, [localTodayIso])
}

function useIsCoarsePointer() {
  const [isCoarse, setIsCoarse] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      setIsCoarse(false)
      return
    }

    const query = window.matchMedia('(pointer: coarse)')
    const update = event => {
      setIsCoarse(Boolean(event?.matches))
    }

    setIsCoarse(query.matches)
    query.addEventListener('change', update)
    return () => {
      query.removeEventListener('change', update)
    }
  }, [])

  return isCoarse
}

function useLocalTodayIso() {
  const [todayIso, setTodayIso] = useState(() => formatLocalDateIso(new Date()))

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }

    let timeoutId = null

    const scheduleNextUpdate = () => {
      const now = new Date()
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      const delay = Math.max(1000, nextMidnight.getTime() - now.getTime())
      timeoutId = window.setTimeout(() => {
        setTodayIso(formatLocalDateIso(new Date()))
        scheduleNextUpdate()
      }, delay)
    }

    scheduleNextUpdate()

    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [])

  return todayIso
}

function buildStatusLabel(status) {
  switch (status) {
    case 'complete':
      return 'תיעוד הושלם'
    case 'missing':
      return 'תיעוד חסר'
    case 'upcoming':
    default:
      return 'תיעוד עתידי'
  }
}

function layoutDaySessions(day, window, {
  sessionDuration = SESSION_DURATION_MINUTES,
  columnHeight: providedColumnHeight,
  slotPositions = null,
} = {}) {
  if (!day || !window) {
    return { chips: [], overflowBadges: [], slotHeights: new Map() }
  }

  const startMinutes = parseMinutes(window.startMinutes ?? window.start)
  const endMinutes = parseMinutes(window.endMinutes ?? window.end)
  if (startMinutes === null || endMinutes === null) {
    return { chips: [], overflowBadges: [], slotHeights: new Map() }
  }

  const duration = Math.max(15, Number(sessionDuration) || SESSION_DURATION_MINUTES)
  const chipHeight = Math.max(
    GRID_ROW_HEIGHT - 8,
    GRID_ROW_HEIGHT * (duration / GRID_INTERVAL_MINUTES) - 8,
  )

  const computedRows = Math.max(1, Math.floor((endMinutes - startMinutes) / GRID_INTERVAL_MINUTES) + 1)
  const columnHeight = Number.isFinite(providedColumnHeight)
    ? providedColumnHeight
    : computedRows * GRID_ROW_HEIGHT

  const events = []

  for (const session of day.sessions || []) {
    const timeMinutes = Number(session?.timeMinutes ?? parseMinutes(session?.time))
    if (!Number.isFinite(timeMinutes)) {
      continue
    }
    if (timeMinutes < startMinutes || timeMinutes > endMinutes) {
      continue
    }
    const relativeStart = timeMinutes - startMinutes
    const slotMinutes = startMinutes + Math.floor(relativeStart / GRID_INTERVAL_MINUTES) * GRID_INTERVAL_MINUTES
    
    // Use cumulative position if available, otherwise fall back to fixed grid
    const top = slotPositions && slotPositions.has(slotMinutes)
      ? slotPositions.get(slotMinutes)
      : (relativeStart / GRID_INTERVAL_MINUTES) * GRID_ROW_HEIGHT
    
    const end = timeMinutes + duration
    events.push({
      session,
      start: timeMinutes,
      end,
      top,
      slotMinutes,
    })
  }

  if (!events.length) {
    return { chips: [], overflowBadges: [], slotHeights: new Map() }
  }

  events.sort((a, b) => {
    if (a.start !== b.start) {
      return a.start - b.start
    }
    return (a.session.studentName || '').localeCompare(b.session.studentName || '', 'he')
  })

  // Build collision groups: sessions that visually overlap
  const collisionGroups = []
  let currentGroup = null

  for (const event of events) {
    if (!currentGroup) {
      currentGroup = { events: [event], maxEnd: event.end, minStart: event.start, slotMinutes: event.slotMinutes }
      continue
    }

    // Check if this event overlaps with any event in the current group
    const overlaps = event.start < currentGroup.maxEnd
    
    if (overlaps) {
      currentGroup.events.push(event)
      currentGroup.maxEnd = Math.max(currentGroup.maxEnd, event.end)
      currentGroup.minStart = Math.min(currentGroup.minStart, event.start)
    } else {
      collisionGroups.push(currentGroup)
      currentGroup = { events: [event], maxEnd: event.end, minStart: event.start, slotMinutes: event.slotMinutes }
    }
  }

  if (currentGroup) {
    collisionGroups.push(currentGroup)
  }

  const chips = []
  const overflowBadges = []
  const slotHeights = new Map()
  
  // Initialize all slots with base height
  const totalSlots = Math.floor((endMinutes - startMinutes) / GRID_INTERVAL_MINUTES) + 1
  for (let i = 0; i < totalSlots; i += 1) {
    const slotMinutes = startMinutes + (i * GRID_INTERVAL_MINUTES)
    slotHeights.set(slotMinutes, GRID_ROW_HEIGHT)
  }
  
  const maxBadgeTop = Math.max(0, columnHeight - OVERFLOW_BADGE_HEIGHT - OVERFLOW_BADGE_VERTICAL_GAP)

  // Process each collision group with strict "Max 2" rule
  for (const group of collisionGroups) {
    const totalEvents = group.events.length

    if (totalEvents <= MAX_VISIBLE_CHIPS) {
      // No overflow: display all events side-by-side
      const widthPercent = 100 / totalEvents
      const visibleWidth = totalEvents === 1
        ? '100%'
        : `calc(${widthPercent}% - ${COLUMN_GAP_PX}px)`
      const horizontalOffsetPx = totalEvents === 1 ? 0 : COLUMN_GAP_PX / 2

      for (let columnIndex = 0; columnIndex < totalEvents; columnIndex += 1) {
        const event = group.events[columnIndex]
        const leftPercent = columnIndex * widthPercent
        const leftValue = totalEvents === 1
          ? '0'
          : `calc(${leftPercent}% + ${horizontalOffsetPx}px)`
        const top = Math.round(event.top)

        chips.push({
          session: event.session,
          top,
          height: chipHeight,
          style: {
            left: leftValue,
            width: totalEvents === 1 ? '100%' : visibleWidth,
          },
          zIndex: totalEvents - columnIndex,
          startMinutes: event.start,
        })
      }
    } else {
      // Overflow: show first 2 side-by-side + badge below
      const widthPercent = 100 / MAX_VISIBLE_CHIPS
      const visibleWidth = `calc(${widthPercent}% - ${COLUMN_GAP_PX}px)`
      const horizontalOffsetPx = COLUMN_GAP_PX / 2

      // Display first 2 chips
      for (let columnIndex = 0; columnIndex < MAX_VISIBLE_CHIPS; columnIndex += 1) {
        const event = group.events[columnIndex]
        const leftPercent = columnIndex * widthPercent
        const leftValue = `calc(${leftPercent}% + ${horizontalOffsetPx}px)`
        const top = Math.round(event.top)

        chips.push({
          session: event.session,
          top,
          height: chipHeight,
          style: {
            left: leftValue,
            width: visibleWidth,
          },
          zIndex: MAX_VISIBLE_CHIPS - columnIndex,
          startMinutes: event.start,
        })
      }

      // Collect hidden sessions (all after the first 2)
      const hiddenSessions = group.events.slice(MAX_VISIBLE_CHIPS).map(e => e.session)

      // Calculate badge position and update slot height
      const baseTop = group.events[0].top
      const clusterBottom = baseTop + chipHeight
      const badgeBottom = clusterBottom + OVERFLOW_BADGE_VERTICAL_GAP + OVERFLOW_BADGE_HEIGHT
      
      // Find which slot this overflow belongs to and increase its height
      const slotMinutes = group.slotMinutes
      const requiredHeight = badgeBottom - baseTop + 8 // Add some padding
      const currentHeight = slotHeights.get(slotMinutes) || GRID_ROW_HEIGHT
      slotHeights.set(slotMinutes, Math.max(currentHeight, requiredHeight))

      overflowBadges.push({
        sessions: hiddenSessions,
        top: clusterBottom + OVERFLOW_BADGE_VERTICAL_GAP,
        centerPercent: 50, // Center the badge
        startMinutes: group.minStart,
        slotMinutes, // Track which slot this belongs to
      })
    }
  }

  chips.sort((a, b) => a.top - b.top)
  overflowBadges.sort((a, b) => a.startMinutes - b.startMinutes)

  return { chips, overflowBadges, slotHeights }
}

function StudentDetailPopover({
  session,
  open,
  setOpen,
  isCoarse,
  onNavigate,
  children,
}) {
  const closeTimeoutRef = useRef(null)
  const ignoreNextFocusRef = useRef(false)

  const clearCloseTimer = useCallback(() => {
    if (closeTimeoutRef.current) {
      window.clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
  }, [])

  const scheduleClose = useCallback(() => {
    if (isCoarse) {
      return
    }
    clearCloseTimer()
    closeTimeoutRef.current = window.setTimeout(() => {
      ignoreNextFocusRef.current = true
      setOpen(false)
    }, 120)
  }, [clearCloseTimer, isCoarse, setOpen])

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer])

  const handleViewProfile = useCallback(() => {
    clearCloseTimer()
    ignoreNextFocusRef.current = true
    setOpen(false)
    onNavigate(session.studentId)
  }, [clearCloseTimer, onNavigate, session.studentId, setOpen])

  const handleOpenChange = useCallback(
    value => {
      if (isCoarse) {
        setOpen(value)
        return
      }
      if (!value) {
        clearCloseTimer()
        ignoreNextFocusRef.current = true
        setOpen(false)
        return
      }
      if (ignoreNextFocusRef.current) {
        ignoreNextFocusRef.current = false
        return
      }
      setOpen(true)
    },
    [clearCloseTimer, isCoarse, setOpen],
  )

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        {children({
          onMouseEnter: () => {
            if (!isCoarse) {
              clearCloseTimer()
              setOpen(true)
            }
          },
          onMouseLeave: scheduleClose,
          onFocus: () => {
            if (!isCoarse) {
              if (ignoreNextFocusRef.current) {
                ignoreNextFocusRef.current = false
                return
              }
              clearCloseTimer()
              setOpen(true)
            }
          },
          onBlur: scheduleClose,
        })}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-56 space-y-sm rounded-lg border border-border bg-popover p-md text-right shadow-lg"
        onMouseEnter={clearCloseTimer}
        onMouseLeave={scheduleClose}
      >
        <div className="space-y-xxs">
          <p className="text-sm font-semibold text-foreground">{session.studentName || '—'}</p>
          <p className="text-xs text-muted-foreground">{session.instructorName || '—'}</p>
          <p className="text-xs text-muted-foreground">
            {session.time ? `שעה ${session.time}` : null}
          </p>
        </div>
        <Button type="button" variant="link" className="px-0" onClick={handleViewProfile}>
          צפה בפרופיל
        </Button>
      </PopoverContent>
    </Popover>
  )
}

function StudentChip({
  session,
  top,
  height,
  style,
  zIndex,
  variant = 'grid',
  onNavigate,
  isCoarse,
}) {
  const [open, setOpen] = useState(false)

  const handleClick = useCallback(
    event => {
      if (isCoarse) {
        event.preventDefault()
        setOpen(previous => !previous)
        return
      }
      onNavigate(session.studentId)
    },
    [isCoarse, onNavigate, session.studentId],
  )

  const chipStyle = buildChipStyle(session.instructorColor, {
    inactive: session.instructorIsActive === false,
  })

  const sharedClassName = cn(
    'flex items-center justify-between gap-xs rounded-md px-sm py-xxs text-xs font-medium text-white shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
    {
      'hover:opacity-90': !isCoarse,
    },
  )

  const statusIcon = STATUS_ICONS[session.status]
  const srLabel = buildStatusLabel(session.status)

  const baseStyle = variant === 'grid'
    ? {
        position: 'absolute',
        top: `${top}px`,
        height: `${height}px`,
        zIndex,
        ...style,
        ...chipStyle,
      }
    : {
        position: 'relative',
        width: '100%',
        ...style,
        ...chipStyle,
      }

  const renderTrigger = handlers => (
    <button
      type="button"
      onClick={handleClick}
      className={sharedClassName}
      style={baseStyle}
      aria-label={`${session.studentName || '—'} • ${srLabel}`}
      {...handlers}
    >
      <span className="truncate">{session.studentName || '—'}</span>
      {statusIcon ? (
        <span className="text-base" aria-hidden="true">{statusIcon}</span>
      ) : null}
      <span className="sr-only">{srLabel}</span>
    </button>
  )

  return (
    <StudentDetailPopover
      session={session}
      open={open}
      setOpen={setOpen}
      isCoarse={isCoarse}
      onNavigate={onNavigate}
    >
      {renderTrigger}
    </StudentDetailPopover>
  )
}

function OverflowBadge({ sessions, top, centerPercent, onNavigate }) {
  const [open, setOpen] = useState(false)

  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => {
      if (a.timeMinutes !== b.timeMinutes) {
        return a.timeMinutes - b.timeMinutes
      }
      return (a.studentName || '').localeCompare(b.studentName || '', 'he')
    }),
    [sessions],
  )

  const total = sortedSessions.length
  const computedStyle = useMemo(
    () => ({
      top: typeof top === 'number' ? `${top}px` : `${OVERFLOW_BADGE_VERTICAL_GAP}px`,
      left: typeof centerPercent === 'number' ? `${centerPercent}%` : '50%',
      transform: 'translate(-50%, 0)',
      zIndex: 30,
    }),
    [centerPercent, top],
  )

  const handleNavigate = useCallback(id => {
    setOpen(false)
    onNavigate(id)
  }, [onNavigate])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`עוד ${total} תלמידים`}
          className="absolute flex h-[32px] min-w-[88px] items-center justify-center rounded-md border border-dashed border-primary bg-primary/10 px-md py-xs text-xs font-semibold text-primary shadow-sm transition hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          style={computedStyle}
        >
          +{total} נוספים
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-64 space-y-sm rounded-lg border border-border bg-popover p-md text-right shadow-lg"
      >
        <p className="text-sm font-semibold text-foreground">תלמידים נוספים</p>
        <div className="max-h-60 space-y-xs overflow-y-auto">
          {sortedSessions.map(session => (
            <button
              key={`${session.studentId}-${session.time}`}
              type="button"
              className="flex w-full items-center justify-between rounded-md border border-border/60 bg-muted/20 px-sm py-xxs text-sm text-foreground transition hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              onClick={() => handleNavigate(session.studentId)}
            >
              <span className="truncate text-right">{session.studentName || '—'}</span>
              <span className="text-xs text-muted-foreground">{session.time?.slice(0, 5) || ''}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function DayScheduleView({
  className,
  days,
  selectedDayIndex,
  onSelectDay,
  gridSlots,
  sessionMaps,
  onNavigate,
  isCoarse,
}) {
  const hasDays = Array.isArray(days) && days.length > 0
  const hasSlots = Array.isArray(gridSlots) && gridSlots.length > 0
  const safeDays = hasDays ? days : []
  const safeSlots = hasSlots ? gridSlots : []
  const selectedDay = safeDays[selectedDayIndex] || safeDays[0] || null
  const selectedDayDisplay = useMemo(() => buildDayDisplay(selectedDay), [selectedDay])
  const sessionMap = selectedDay && sessionMaps instanceof Map
    ? sessionMaps.get(selectedDay.date)
    : null

  if (!hasDays || !hasSlots) {
    return null
  }

  return (
    <div className={cn('space-y-sm', className)}>
      <div className="mb-sm flex gap-sm overflow-x-auto pb-sm">
        {safeDays.map((day, index) => {
          const display = buildDayDisplay(day)
          const isSelected = index === selectedDayIndex
          return (
            <Button
              key={day.date}
              type="button"
              size="sm"
              variant={isSelected ? 'default' : 'outline'}
              aria-pressed={isSelected}
              onClick={() => onSelectDay(index)}
              className="flex-col gap-0 text-center leading-tight"
            >
              <span className="text-sm font-semibold">{display.label || '—'}</span>
              <span
                className={cn(
                  'text-xs font-normal',
                  isSelected ? 'text-primary-foreground' : 'text-muted-foreground',
                )}
              >
                {display.date || '—'}
              </span>
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
          {safeSlots.map(minutes => {
            const label = formatTimeLabel(minutes)
            const sessionsAtSlot = sessionMap?.get(minutes) || []
            return (
              <div key={`${selectedDay?.date}-${minutes}`} className="rounded-lg border border-border p-sm">
                <p className="mb-xs text-sm font-medium text-muted-foreground">{label}</p>
                <div className="flex flex-col gap-xs">
                  {sessionsAtSlot.length === 0 ? (
                    <span className="text-xs text-muted-foreground">אין תלמידים בזמן זה.</span>
                  ) : (
                    sessionsAtSlot.map(session => (
                      <StudentChip
                        key={`${session.studentId}-${session.time}`}
                        session={session}
                        variant="list"
                        top={0}
                        height={GRID_ROW_HEIGHT - 8}
                        style={{}}
                        zIndex={1}
                        onNavigate={onNavigate}
                        isCoarse={isCoarse}
                      />
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default function WeeklyComplianceView({ orgId }) {
  const navigate = useNavigate()
  const localTodayIso = useLocalTodayIso()
  const initialWeekStart = useInitialWeekStart(localTodayIso)
  const [weekStart, setWeekStart] = useState(initialWeekStart)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedDayIndex, setSelectedDayIndex] = useState(0)
  const isCoarsePointer = useIsCoarsePointer()
  const [viewMode, setViewMode] = useState('week')
  const [isBelowBreakpoint, setIsBelowBreakpoint] = useState(false)
  const containerRef = useRef(null)
  const manualSelectionRef = useRef(false)

  useEffect(() => {
    const element = containerRef.current
    if (!element) {
      return undefined
    }

    const updateForWidth = width => {
      const below = width < WEEK_VIEW_MIN_WIDTH
      setIsBelowBreakpoint(below)
      if (below) {
        manualSelectionRef.current = false
        setViewMode('day')
      } else if (!manualSelectionRef.current) {
        setViewMode('week')
      }
    }

    updateForWidth(element.clientWidth)

    if (typeof ResizeObserver === 'undefined') {
      const handleResize = () => updateForWidth(element.clientWidth)
      if (typeof window !== 'undefined') {
        window.addEventListener('resize', handleResize)
      }
      return () => {
        if (typeof window !== 'undefined') {
          window.removeEventListener('resize', handleResize)
        }
      }
    }

    const observer = new ResizeObserver(entries => {
      const entry = entries[0]
      const width = entry?.contentRect?.width ?? element.clientWidth
      updateForWidth(width)
    })

    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }, [])

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

  const daysSource = data?.days
  const days = useMemo(() => {
    if (!Array.isArray(daysSource)) {
      return []
    }
    return daysSource.map(day => {
      const dayDate = day?.date || ''
      const isToday = Boolean(localTodayIso) && dayDate === localTodayIso
      const normalizedSessions = Array.isArray(day?.sessions)
        ? day.sessions.map(session => {
            const hasRecord = session?.hasRecord === true
            const resolvedStatus = hasRecord
              ? 'complete'
              : localTodayIso && dayDate
                ? dayDate <= localTodayIso
                  ? 'missing'
                  : 'upcoming'
                : session?.status || 'upcoming'
            return {
              ...session,
              status: resolvedStatus,
            }
          })
        : []

      return {
        ...day,
        isToday,
        sessions: normalizedSessions,
      }
    })
  }, [daysSource, localTodayIso])

  const timeWindow = data?.timeWindow || null
  const gridSlots = useMemo(() => createGridSlots(timeWindow), [timeWindow])
  const windowMetrics = useMemo(() => {
    if (!timeWindow) {
      return null
    }
    const startMinutes = parseMinutes(timeWindow.startMinutes ?? timeWindow.start)
    const endMinutes = parseMinutes(timeWindow.endMinutes ?? timeWindow.end)
    if (startMinutes === null || endMinutes === null) {
      return null
    }
    const totalRows = Math.max(1, Math.floor((endMinutes - startMinutes) / GRID_INTERVAL_MINUTES) + 1)
    return {
      startMinutes,
      endMinutes,
      columnHeight: totalRows * GRID_ROW_HEIGHT,
    }
  }, [timeWindow])
  const gridHeight = windowMetrics?.columnHeight ?? gridSlots.length * GRID_ROW_HEIGHT
  const sessionDuration = data?.sessionDurationMinutes || SESSION_DURATION_MINUTES

  // First pass: calculate layouts to determine required slot heights
  const initialLayouts = useMemo(() => {
    const layoutMap = new Map()
    for (const day of days) {
      layoutMap.set(
        day.date,
        layoutDaySessions(day, timeWindow, {
          sessionDuration,
          columnHeight: windowMetrics?.columnHeight,
        }),
      )
    }
    return layoutMap
  }, [days, timeWindow, sessionDuration, windowMetrics?.columnHeight])

  // Calculate unified slot heights across all days (max height for each slot)
  const unifiedSlotHeights = useMemo(() => {
    const merged = new Map()
    
    // Initialize with base heights
    for (const slotMinutes of gridSlots) {
      merged.set(slotMinutes, GRID_ROW_HEIGHT)
    }
    
    // Find max height needed for each slot across all days
    for (const layout of initialLayouts.values()) {
      if (layout?.slotHeights) {
        for (const [slotMinutes, height] of layout.slotHeights.entries()) {
          const currentMax = merged.get(slotMinutes) || GRID_ROW_HEIGHT
          merged.set(slotMinutes, Math.max(currentMax, height))
        }
      }
    }
    
    return merged
  }, [initialLayouts, gridSlots])

  // Calculate cumulative positions for each slot start
  const slotCumulativePositions = useMemo(() => {
    const positions = new Map()
    let cumulative = 0
    
    for (const slotMinutes of gridSlots) {
      positions.set(slotMinutes, cumulative)
      const slotHeight = unifiedSlotHeights.get(slotMinutes) || GRID_ROW_HEIGHT
      cumulative += slotHeight
    }
    
    return positions
  }, [gridSlots, unifiedSlotHeights])

  // Second pass: recalculate layouts with cumulative positions
  const dayLayouts = useMemo(() => {
    const layoutMap = new Map()
    for (const day of days) {
      layoutMap.set(
        day.date,
        layoutDaySessions(day, timeWindow, {
          sessionDuration,
          columnHeight: windowMetrics?.columnHeight,
          slotPositions: slotCumulativePositions,
        }),
      )
    }
    return layoutMap
  }, [days, timeWindow, sessionDuration, windowMetrics?.columnHeight, slotCumulativePositions])

  // Calculate total grid height based on dynamic slot heights
  const dynamicGridHeight = useMemo(() => {
    let total = 0
    for (const slotMinutes of gridSlots) {
      total += unifiedSlotHeights.get(slotMinutes) || GRID_ROW_HEIGHT
    }
    return total
  }, [gridSlots, unifiedSlotHeights])

  const mobileSessionMaps = useMemo(() => {
    const result = new Map()
    for (const day of days) {
      result.set(day.date, groupSessionsForMobile(day, gridSlots))
    }
    return result
  }, [days, gridSlots])

  const isCurrentWeek = weekStart === initialWeekStart

  useEffect(() => {
    if (!days.length) {
      setSelectedDayIndex(0)
      return
    }

    if (localTodayIso) {
      const todayIndex = days.findIndex(day => day.date === localTodayIso)
      if (todayIndex >= 0) {
        setSelectedDayIndex(todayIndex)
        return
      }
    }

    setSelectedDayIndex(0)
  }, [days, localTodayIso])

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

  const handleNavigateToStudent = useCallback(
    studentId => {
      if (!studentId) {
        return
      }
      navigate(`/students/${studentId}`)
    },
    [navigate],
  )

  const defaultViewMode = isBelowBreakpoint ? 'day' : 'week'

  const handleViewModeChange = useCallback(
    nextMode => {
      if (nextMode === 'week' && isBelowBreakpoint) {
        return
      }
      if (nextMode === defaultViewMode) {
        manualSelectionRef.current = false
      } else {
        manualSelectionRef.current = true
      }
      setViewMode(nextMode)
    },
    [defaultViewMode, isBelowBreakpoint],
  )

  return (
    <div
      ref={containerRef}
      className="relative"
    >
      <Card className="relative overflow-visible rounded-2xl border border-border bg-surface p-lg shadow-sm">
        <div className="relative min-w-0" dir="rtl">
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
            <div className="flex flex-wrap items-center gap-sm md:justify-end">
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
              {!isBelowBreakpoint ? (
                <div className="hidden items-center gap-xs rounded-full border border-border/60 bg-muted/40 p-xxs md:inline-flex">
                  <Button
                    type="button"
                    size="sm"
                    variant={viewMode === 'week' ? 'default' : 'ghost'}
                    aria-pressed={viewMode === 'week'}
                    onClick={() => handleViewModeChange('week')}
                  >
                    שבוע
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={viewMode === 'day' ? 'default' : 'ghost'}
                    aria-pressed={viewMode === 'day'}
                    onClick={() => handleViewModeChange('day')}
                  >
                    יום
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
          {isLoading ? (
            <div className="flex justify-center py-xl">
              <span className="text-sm text-muted-foreground">טוען נתוני שיעורים...</span>
            </div>
          ) : null}
          {error ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-lg text-destructive">
              <p className="text-base font-semibold">אירעה שגיאה בטעינת הנתונים.</p>
              <p className="mt-xs text-sm">נסו לרענן את הדף או לחזור מאוחר יותר.</p>
            </div>
          ) : null}
          {!isLoading && !error && days.length === 0 ? (
            <p className="text-sm text-muted-foreground">אין מפגשים מתוכננים לשבוע זה.</p>
          ) : null}

          {!isLoading && !error && days.length > 0 && gridSlots.length > 0 && (
            <>
              {viewMode === 'week' ? (
                <div className="hidden md:block">
                  <div
                    className="grid"
                    style={{ gridTemplateColumns: `60px repeat(${days.length}, minmax(0, 1fr))` }}
                  >
                    <div className="sticky top-0 bg-surface" />
                    {days.map(day => {
                      const display = buildDayDisplay(day)
                      return (
                        <div
                          key={day.date}
                          className={cn(
                            'sticky top-0 z-10 border-b border-border px-sm py-xs text-center text-sm font-medium',
                            day.isToday
                              ? 'bg-primary text-primary-foreground shadow-sm'
                              : 'bg-muted/30 text-foreground',
                          )}
                        >
                          <span className="block text-base font-semibold">{display.label || '—'}</span>
                          <span
                            className={cn(
                              'mt-1 block text-xs font-normal',
                              day.isToday ? 'text-primary-foreground/90' : 'text-muted-foreground',
                            )}
                          >
                            {display.date || '—'}
                          </span>
                        </div>
                      )
                    })}
                    <div
                      className="relative border-l border-border"
                      style={{ height: `${dynamicGridHeight}px` }}
                    >
                      <div className="text-sm text-muted-foreground">
                        {gridSlots.map(minutes => {
                          const slotHeight = unifiedSlotHeights.get(minutes) || GRID_ROW_HEIGHT
                          return (
                            <div
                              key={`time-${minutes}`}
                              className="flex items-start justify-end border-b border-border pr-sm pt-xxs"
                              style={{ height: `${slotHeight}px` }}
                            >
                              {formatTimeLabel(minutes)}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                    {days.map(day => {
                      const layout = dayLayouts.get(day.date)
                      const chipItems = layout?.chips ?? []
                      const overflowItems = layout?.overflowBadges ?? []
                      return (
                        <div
                          key={`column-${day.date}`}
                          className={cn(
                            'relative border-b border-l border-border',
                            day.isToday ? 'bg-primary/5' : 'bg-background/60',
                          )}
                          style={{ height: `${dynamicGridHeight}px` }}
                        >
                          <div aria-hidden="true">
                            {gridSlots.map(minutes => {
                              const slotHeight = unifiedSlotHeights.get(minutes) || GRID_ROW_HEIGHT
                              return (
                                <div
                                  key={`${day.date}-row-${minutes}`}
                                  className="border-b border-border/70"
                                  style={{ height: `${slotHeight}px` }}
                                />
                              )
                            })}
                          </div>
                          {chipItems.map(item => (
                            <StudentChip
                              key={`${item.session.studentId}-${item.session.time}`}
                              session={item.session}
                              top={item.top}
                              height={item.height}
                              style={item.style}
                              zIndex={item.zIndex}
                              onNavigate={handleNavigateToStudent}
                              isCoarse={isCoarsePointer}
                            />
                          ))}
                          {overflowItems.map(item => (
                            <OverflowBadge
                              key={`${day.date}-overflow-${item.startMinutes}`}
                              sessions={item.sessions}
                              top={item.top}
                              centerPercent={item.centerPercent}
                              onNavigate={handleNavigateToStudent}
                            />
                          ))}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : null}

              <DayScheduleView
                className="block md:hidden"
                days={days}
                selectedDayIndex={selectedDayIndex}
                onSelectDay={setSelectedDayIndex}
                gridSlots={gridSlots}
                sessionMaps={mobileSessionMaps}
                onNavigate={handleNavigateToStudent}
                isCoarse={isCoarsePointer}
              />
              {viewMode === 'day' ? (
                <DayScheduleView
                  className="hidden md:block"
                  days={days}
                  selectedDayIndex={selectedDayIndex}
                  onSelectDay={setSelectedDayIndex}
                  gridSlots={gridSlots}
                  sessionMaps={mobileSessionMaps}
                  onNavigate={handleNavigateToStudent}
                  isCoarse={isCoarsePointer}
                />
              ) : null}
            </>
          )}
        </div>
      </Card>
    </div>
  )
}
