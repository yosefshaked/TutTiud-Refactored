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
import InstructorLegend from './InstructorLegend.jsx'
import DayDetailView from './DayDetailView.jsx'

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

/**
 * Calculate the exact vertical position for a session based on its precise start time.
 * This creates an "in-between" effect where :15 and :45 sessions span across slot boundaries.
 * 
 * @param {number} startTime - Exact start time in minutes from midnight
 * @param {number} windowStartMinutes - Start of the time window
 * @param {Map} slotPositions - Cumulative positions for each slot (if using dynamic heights)
 * @returns {number} Top position in pixels
 */
function calculateChipTopPosition(startTime, windowStartMinutes, slotPositions = null) {
  const relativeMinutes = startTime - windowStartMinutes
  
  // If using cumulative slot positions (dynamic heights), we need a more complex calculation
  if (slotPositions) {
    // Find the base slot this time belongs to
    const slotIndex = Math.floor(relativeMinutes / GRID_INTERVAL_MINUTES)
    const slotMinutes = windowStartMinutes + (slotIndex * GRID_INTERVAL_MINUTES)
    const slotBaseTop = slotPositions.get(slotMinutes) || (slotIndex * GRID_ROW_HEIGHT)
    
    // Calculate offset within the slot
    const offsetWithinSlot = relativeMinutes % GRID_INTERVAL_MINUTES
    const offsetPixels = (offsetWithinSlot / GRID_INTERVAL_MINUTES) * GRID_ROW_HEIGHT
    
    return slotBaseTop + offsetPixels
  }
  
  // Simple fixed-height calculation: each minute = proportional pixel offset
  // This creates the "in-between" effect naturally
  return (relativeMinutes / GRID_INTERVAL_MINUTES) * GRID_ROW_HEIGHT
}

/**
 * Layout engine with sub-row positioning and granular overflow badges.
 * 
 * Key behaviors:
 * 1. Precise positioning: Sessions positioned by exact minute (creates "in-between" effect)
 * 2. Cross-time collision detection: Handles overlaps between different start times (e.g., 15:00 vs 15:15)
 * 3. Max 2 chips per collision group: Shows up to 2 chips side-by-side, rest go into "+X more" badge
 * 4. Granular overflow: Each start time within a collision group gets its own overflow badge
 */
function layoutDaySessions(day, window, {
  sessionDuration = SESSION_DURATION_MINUTES,
  // columnHeight parameter reserved for future enhancements
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
  const baseChipHeight = Math.max(
    GRID_ROW_HEIGHT - 8,
    GRID_ROW_HEIGHT * (duration / GRID_INTERVAL_MINUTES) - 8,
  )

  const computedRows = Math.max(1, Math.floor((endMinutes - startMinutes) / GRID_INTERVAL_MINUTES) + 1)
  // Note: columnHeight computed but not used in current layout logic (reserved for future enhancements)
  void computedRows

  // Helper to detect quarter-hour sessions
  const isQuarterHour = (timeMinutes) => {
    const minuteWithinHour = timeMinutes % 60
    return minuteWithinHour === 15 || minuteWithinHour === 45
  }

  // Build events array with exact positioning
  const events = []
  for (const session of day.sessions || []) {
    const timeMinutes = Number(session?.timeMinutes ?? parseMinutes(session?.time))
    if (!Number.isFinite(timeMinutes)) {
      continue
    }
    if (timeMinutes < startMinutes || timeMinutes > endMinutes) {
      continue
    }

    const top = calculateChipTopPosition(timeMinutes, startMinutes, slotPositions)
    
    // Use consistent base height for clean UI - don't try to span multiple slots visually
    // The chip represents a 30-minute session and should have a consistent, professional height
    const actualChipHeight = baseChipHeight
    const bottom = top + actualChipHeight

    // Compute a boundary hint offset for :15/:45 sessions (visual-only divider inside single chip)
    let boundaryHintOffset = null
    if (isQuarterHour(timeMinutes)) {
      // For quarter-hour sessions, the hint should appear halfway through the chip height
      // This creates a subtle visual indication without complex calculations
      boundaryHintOffset = actualChipHeight / 2
    }

    // Single chip per session
    events.push({
      session,
      startTime: timeMinutes,
      endTime: timeMinutes + duration,
      top,
      bottom,
      chipHeight: actualChipHeight,
      boundaryHintOffset,
    })
  }

  if (!events.length) {
    return { chips: [], overflowBadges: [], slotHeights: new Map() }
  }

  // Sort by start time, then by student name
  events.sort((a, b) => {
    if (a.startTime !== b.startTime) {
      return a.startTime - b.startTime
    }
    return (a.session.studentName || '').localeCompare(b.session.studentName || '', 'he')
  })

  // Group sessions for unified processing (single event per session)
  const sessionGroups = []
  for (const event of events) {
    sessionGroups.push({
      events: [event],
      startTime: event.startTime,
      session: event.session,
      isSplit: false,
      minTop: event.top,
      maxBottom: event.bottom,
      boundaryHintOffset: event.boundaryHintOffset,
    })
  }

  // Build collision groups: session groups that visually overlap
  const collisionGroups = []
  let currentGroup = null

  for (const sessionGroup of sessionGroups) {
    if (!currentGroup) {
      currentGroup = { 
        sessionGroups: [sessionGroup], 
        minTop: sessionGroup.minTop,
        maxBottom: sessionGroup.maxBottom,
        minStartTime: sessionGroup.startTime,
      }
      continue
    }

    // Check if this session group visually overlaps with the current collision group's range
    const overlaps = sessionGroup.minTop < currentGroup.maxBottom

    if (overlaps) {
      currentGroup.sessionGroups.push(sessionGroup)
      currentGroup.minTop = Math.min(currentGroup.minTop, sessionGroup.minTop)
      currentGroup.maxBottom = Math.max(currentGroup.maxBottom, sessionGroup.maxBottom)
      currentGroup.minStartTime = Math.min(currentGroup.minStartTime, sessionGroup.startTime)
    } else {
      collisionGroups.push(currentGroup)
      currentGroup = { 
        sessionGroups: [sessionGroup], 
        minTop: sessionGroup.minTop,
        maxBottom: sessionGroup.maxBottom,
        minStartTime: sessionGroup.startTime,
      }
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

  // Process each collision group
  for (const group of collisionGroups) {
    const totalSessions = group.sessionGroups.length

  if (totalSessions <= MAX_VISIBLE_CHIPS) {
      // No overflow: display all sessions side-by-side
      const widthPercent = 100 / totalSessions
      const visibleWidth = totalSessions === 1
        ? '100%'
        : `calc(${widthPercent}% - ${COLUMN_GAP_PX}px)`
      const horizontalOffsetPx = totalSessions === 1 ? 0 : COLUMN_GAP_PX / 2

      for (let columnIndex = 0; columnIndex < totalSessions; columnIndex += 1) {
        const sessionGroup = group.sessionGroups[columnIndex]
        const leftPercent = columnIndex * widthPercent
        const leftValue = totalSessions === 1
          ? '0'
          : `calc(${leftPercent}% + ${horizontalOffsetPx}px)`

        // Single chip per session group - use consistent height
        const chipTop = Math.round(sessionGroup.minTop)
        const chipHeight = sessionGroup.events[0].chipHeight // Use the event's calculated height
        
        chips.push({
          session: sessionGroup.session,
          top: chipTop,
          height: chipHeight,
          style: {
            left: leftValue,
            width: totalSessions === 1 ? '100%' : visibleWidth,
          },
          zIndex: totalSessions - columnIndex,
          startMinutes: sessionGroup.startTime,
          boundaryHintOffset: sessionGroup.boundaryHintOffset,
        })
      }

      // Update slot heights for non-overflow groups
      const startSlotIndex = Math.floor((group.minStartTime - startMinutes) / GRID_INTERVAL_MINUTES)
      const endSlotIndex = Math.floor((group.maxBottom / GRID_ROW_HEIGHT))
      
      for (let i = startSlotIndex; i <= endSlotIndex && i < totalSlots; i += 1) {
        const affectedSlotMinutes = startMinutes + (i * GRID_INTERVAL_MINUTES)
        const slotBaseTop = slotPositions?.get(affectedSlotMinutes) ?? (i * GRID_ROW_HEIGHT)
        const requiredHeight = group.maxBottom - slotBaseTop + 8
        const currentHeight = slotHeights.get(affectedSlotMinutes) || GRID_ROW_HEIGHT
        slotHeights.set(affectedSlotMinutes, Math.max(currentHeight, requiredHeight))
      }
    } else {
      const visibleGroups = group.sessionGroups.slice(0, MAX_VISIBLE_CHIPS)
      const hiddenGroups = group.sessionGroups.slice(MAX_VISIBLE_CHIPS)
      const widthPercent = MAX_VISIBLE_CHIPS === 1 ? 100 : 100 / MAX_VISIBLE_CHIPS
      const visibleWidth = MAX_VISIBLE_CHIPS === 1
        ? '100%'
        : `calc(${widthPercent}% - ${COLUMN_GAP_PX}px)`
      const horizontalOffsetPx = MAX_VISIBLE_CHIPS === 1 ? 0 : COLUMN_GAP_PX / 2

      visibleGroups.forEach((sessionGroup, columnIndex) => {
        const leftPercent = columnIndex * widthPercent
        const leftValue = MAX_VISIBLE_CHIPS === 1
          ? '0'
          : `calc(${leftPercent}% + ${horizontalOffsetPx}px)`
        const chipTop = Math.round(sessionGroup.minTop)
        const chipHeight = sessionGroup.events[0].chipHeight

        chips.push({
          session: sessionGroup.session,
          top: chipTop,
          height: chipHeight,
          style: {
            left: leftValue,
            width: visibleWidth,
          },
          zIndex: MAX_VISIBLE_CHIPS - columnIndex,
          startMinutes: sessionGroup.startTime,
          boundaryHintOffset: sessionGroup.boundaryHintOffset,
        })
      })

      const highestBottom = Math.max(...visibleGroups.map(groupItem => groupItem.maxBottom))

      if (hiddenGroups.length > 0) {
        const overflowTop = highestBottom + OVERFLOW_BADGE_VERTICAL_GAP
        overflowBadges.push({
          sessions: hiddenGroups.map(sg => sg.session),
          top: overflowTop,
          startMinutes: hiddenGroups[0]?.startTime ?? visibleGroups[0]?.startTime ?? group.minStartTime,
        })
        group.maxBottom = Math.max(group.maxBottom, overflowTop + OVERFLOW_BADGE_HEIGHT)
      }

      const startSlotIndex = Math.floor((group.minStartTime - startMinutes) / GRID_INTERVAL_MINUTES)
      const endSlotIndex = Math.floor((group.maxBottom / GRID_ROW_HEIGHT))

      for (let i = startSlotIndex; i <= endSlotIndex && i < totalSlots; i += 1) {
        const affectedSlotMinutes = startMinutes + (i * GRID_INTERVAL_MINUTES)
        const slotBaseTop = slotPositions?.get(affectedSlotMinutes) ?? (i * GRID_ROW_HEIGHT)
        const requiredHeight = group.maxBottom - slotBaseTop + 8
        const currentHeight = slotHeights.get(affectedSlotMinutes) || GRID_ROW_HEIGHT
        slotHeights.set(affectedSlotMinutes, Math.max(currentHeight, requiredHeight))
      }
    }
  }

  chips.sort((a, b) => {
    if (a.top !== b.top) {
      return a.top - b.top
    }
    return a.startMinutes - b.startMinutes
  })
  
  overflowBadges.sort((a, b) => {
    if (a.top !== b.top) {
      return a.top - b.top
    }
    return a.startMinutes - b.startMinutes
  })

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
  boundaryHintOffset = null,
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
    'relative flex items-center justify-between gap-xs px-sm py-xxs text-xs font-medium text-white shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded-md',
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
        {typeof boundaryHintOffset === 'number' && boundaryHintOffset > 0 && boundaryHintOffset < height ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-0 right-0 h-px bg-white/40"
            style={{ top: `${boundaryHintOffset}px` }}
          />
        ) : null}
        <span className="relative z-10 truncate">{session.studentName || '—'}</span>
        {statusIcon ? (
          <span className="relative z-10 text-base" aria-hidden="true">{statusIcon}</span>
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

function OverflowBadge({ sessions, top, onNavigate }) {
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
  const computedStyle = useMemo(() => ({
    top: typeof top === 'number' ? `${top}px` : `${OVERFLOW_BADGE_VERTICAL_GAP}px`,
    left: '12px',
    right: '12px',
    zIndex: 30,
  }), [top])

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
          className={cn(
            'absolute flex h-9 items-center justify-center rounded-lg border border-dashed border-primary bg-primary/10 px-md text-sm font-semibold text-primary shadow-sm transition hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
          )}
          style={computedStyle}
        >
          {`+${total} נוספים`}
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

function MobileWeekDayList({ days, onOpenDetail }) {
  if (!Array.isArray(days) || days.length === 0) {
    return null
  }

  return (
    <div className="space-y-sm">
      {days.map(day => {
        const display = buildDayDisplay(day)
        const summary = day.summary || {}
        const total = summary.totalSessions ?? (day.sessions?.length ?? 0)
        const documented = summary.documentedSessions ?? ((day.sessions || []).filter(session => session.hasRecord).length)
        const missing = summary.missingSessions ?? ((day.sessions || []).filter(session => session.status === 'missing').length)
        return (
          <button
            key={day.date}
            type="button"
            onClick={() => onOpenDetail(day.date)}
            className={cn(
              'w-full rounded-2xl border border-border bg-card px-lg py-md text-right shadow-sm transition hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
              day.isToday ? 'ring-2 ring-primary/40' : null,
            )}
            aria-label={`פתיחת תצוגת היום עבור ${display.label || ''}`}
          >
            <div className="flex items-center justify-between gap-sm">
              <div>
                <p className="text-base font-semibold text-foreground">{display.label || '—'}</p>
                <p className="text-sm text-muted-foreground">{display.date || '—'}</p>
              </div>
              <div className="text-right text-sm text-muted-foreground">
                <p>{`${documented}/${total} מתועדים`}</p>
                {missing > 0 ? <p className="text-destructive">{`${missing} חסרים`}</p> : null}
              </div>
            </div>
          </button>
        )
      })}
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
  const [detailDate, setDetailDate] = useState(null)
  const [isDayDetailOpen, setIsDayDetailOpen] = useState(false)
  const isCoarsePointer = useIsCoarsePointer()
  const [isBelowBreakpoint, setIsBelowBreakpoint] = useState(false)
  const containerRef = useRef(null)

  useEffect(() => {
    const element = containerRef.current
    if (!element) {
      return undefined
    }

    const updateForWidth = width => {
      setIsBelowBreakpoint(width < WEEK_VIEW_MIN_WIDTH)
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

      const documentedSessions = normalizedSessions.filter(session => session.hasRecord).length
      const missingSessions = normalizedSessions.filter(session => session.status === 'missing').length
      const upcomingSessions = normalizedSessions.filter(session => session.status === 'upcoming').length

      return {
        ...day,
        isToday,
        sessions: normalizedSessions,
        summary: {
          totalSessions: normalizedSessions.length,
          documentedSessions,
          missingSessions,
          upcomingSessions,
        },
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

  const handleNavigateToStudent = useCallback(
    studentId => {
      if (!studentId) {
        return
      }
      navigate(`/students/${studentId}`)
    },
    [navigate],
  )

  const handleOpenDayDetail = useCallback(dateValue => {
    if (!dateValue) {
      return
    }
    setDetailDate(dateValue)
    setIsDayDetailOpen(true)
  }, [])

  const handleCloseDayDetail = useCallback(() => {
    setIsDayDetailOpen(false)
  }, [])

  useEffect(() => {
    if (!isDayDetailOpen || !detailDate) {
      return
    }
    const exists = days.some(day => day.date === detailDate)
    if (!exists) {
      setIsDayDetailOpen(false)
    }
  }, [days, detailDate, isDayDetailOpen])

  return (
    <div ref={containerRef} className="relative">
      <div className="flex flex-col gap-xl md:flex-row md:items-start">
        {!isBelowBreakpoint ? (
          <div className="md:w-[300px] md:flex-shrink-0">
            <div
              className="sticky"
              style={{ top: 'calc(var(--app-shell-header-height, 64px) + 16px)' }}
            >
              <InstructorLegend orgId={orgId} weekStart={weekStart} variant="floating" />
            </div>
          </div>
        ) : null}
        <Card className="relative flex-1 overflow-visible rounded-2xl border border-border bg-surface p-lg shadow-sm">
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

            {!isLoading && !error && days.length > 0 ? (
              !isBelowBreakpoint && gridSlots.length > 0 ? (
                <div className="hidden md:block">
                  <div className="sticky top-0 z-20 bg-surface shadow-md">
                    <div
                      className="grid border-b border-border bg-surface"
                      style={{ gridTemplateColumns: `60px repeat(${days.length}, minmax(0, 1fr))` }}
                    >
                      <div className="bg-surface" />
                      {days.map(day => {
                        const display = buildDayDisplay(day)
                        return (
                          <button
                            key={day.date}
                            type="button"
                            onClick={() => handleOpenDayDetail(day.date)}
                            className={cn(
                              'border-b border-border px-sm py-xs text-center text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                              day.isToday
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted text-foreground',
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
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div
                    className="grid"
                    style={{ gridTemplateColumns: `60px repeat(${days.length}, minmax(0, 1fr))` }}
                  >
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
                              key={`${item.session?.studentId ?? item.session?.id}-${item.startMinutes}`}
                              session={item.session}
                              top={item.top}
                              height={item.height}
                              style={item.style}
                              zIndex={item.zIndex}
                              onNavigate={handleNavigateToStudent}
                              isCoarse={isCoarsePointer}
                              boundaryHintOffset={item.boundaryHintOffset}
                            />
                          ))}
                          {overflowItems.map(item => (
                            <OverflowBadge
                              key={`${day.date}-overflow-${item.startMinutes}`}
                              sessions={item.sessions}
                              top={item.top}
                              onNavigate={handleNavigateToStudent}
                            />
                          ))}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <MobileWeekDayList days={days} onOpenDetail={handleOpenDayDetail} />
              )
            ) : null}
          </div>
        </Card>
      </div>
      {isBelowBreakpoint ? (
        <div className="mt-md">
          <InstructorLegend orgId={orgId} weekStart={weekStart} variant="inline" />
        </div>
      ) : null}
      <DayDetailView orgId={orgId} date={detailDate} open={isDayDetailOpen} onClose={handleCloseDayDetail} />
    </div>
  )
}
