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
const MAX_VISIBLE_COLUMNS = MAX_VISIBLE_CHIPS + 1
const WEEK_VIEW_MIN_WIDTH = 1015

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

function normalizeColorIdentifier(identifier) {
  if (!identifier || typeof identifier !== 'string') {
    return []
  }
  return identifier
    .split(',')
    .map(token => token.trim())
    .filter(Boolean)
}

function buildChipStyle(identifier, { inactive = false } = {}) {
  const colors = normalizeColorIdentifier(identifier)
  if (!colors.length) {
    return { backgroundColor: '#6B7280', color: 'white' }
  }

  if (colors.length === 1) {
    const color = colors[0]
    if (inactive) {
      return {
        color: 'white',
        backgroundImage: `linear-gradient(135deg, ${color}, ${color}), repeating-linear-gradient(45deg, rgba(255,255,255,0.28) 0, rgba(255,255,255,0.28) 8px, transparent 8px, transparent 16px)`,
      }
    }
    return { backgroundColor: color, color: 'white' }
  }

  const gradient = `linear-gradient(135deg, ${colors.join(', ')})`
  if (inactive) {
    return {
      color: 'white',
      backgroundImage: `linear-gradient(135deg, ${colors.join(', ')}), repeating-linear-gradient(45deg, rgba(255,255,255,0.28) 0, rgba(255,255,255,0.28) 8px, transparent 8px, transparent 16px)`,
    }
  }
  return {
    color: 'white',
    backgroundImage: gradient,
  }
}

function buildLegendStyle(identifier, { inactive = false } = {}) {
  const colors = normalizeColorIdentifier(identifier)
  if (!colors.length) {
    return { backgroundColor: '#6B7280' }
  }
  if (colors.length === 1) {
    const color = colors[0]
    if (inactive) {
      return {
        backgroundImage: `linear-gradient(135deg, ${color}, ${color}), repeating-linear-gradient(45deg, rgba(255,255,255,0.32) 0, rgba(255,255,255,0.32) 6px, transparent 6px, transparent 12px)`,
      }
    }
    return { backgroundColor: color }
  }
  const gradient = `linear-gradient(135deg, ${colors.join(', ')})`
  if (inactive) {
    return {
      backgroundImage: `${gradient}, repeating-linear-gradient(45deg, rgba(255,255,255,0.32) 0, rgba(255,255,255,0.32) 6px, transparent 6px, transparent 12px)`,
    }
  }
  return { backgroundImage: gradient }
}

function LegendEntries({ legend, itemClassName = '' }) {
  if (!Array.isArray(legend) || legend.length === 0) {
    return null
  }

  return legend.map(item => (
    <div key={item.id} className={cn('flex items-center gap-xs text-sm text-muted-foreground', itemClassName)}>
      <span
        aria-hidden="true"
        className="inline-block h-3 w-3 rounded-full border border-border"
        style={buildLegendStyle(item.color, { inactive: item.isActive === false })}
      />
      <span className="truncate">{item.name}</span>
      {item.isActive === false ? (
        <span className="text-xs text-destructive">מדריך לא פעיל</span>
      ) : null}
    </div>
  ))
}

function InlineInstructorLegend({ legend, isLoading }) {
  if (!legend?.length && !isLoading) {
    return (
      <p className="mb-lg text-sm text-muted-foreground">
        אין מדריכים להצגה בשבוע זה.
      </p>
    )
  }

  if (!legend?.length) {
    return null
  }

  return (
    <div className="mb-lg flex flex-wrap gap-sm md:hidden">
      <LegendEntries legend={legend} />
    </div>
  )
}

function FloatingInstructorLegend({ legend }) {
  const legendRef = useRef(null)
  const [isFloating, setIsFloating] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }

    let frame = null
    const TOP_OFFSET = 24

    const evaluate = () => {
      frame = null
      const node = legendRef.current
      if (!node) {
        return
      }
      if (node.getClientRects().length === 0) {
        setIsFloating(prev => (prev === false ? prev : false))
        return
      }
      const { top } = node.getBoundingClientRect()
      const floating = top <= TOP_OFFSET + 1
      setIsFloating(prev => (prev === floating ? prev : floating))
    }

    const handleScroll = () => {
      if (frame !== null) {
        return
      }
      frame = window.requestAnimationFrame(evaluate)
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll)

    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
      if (frame !== null) {
        window.cancelAnimationFrame(frame)
      }
    }
  }, [])

  if (!legend?.length) {
    return null
  }

  return (
    <div
      ref={legendRef}
      className={cn(
        'hidden w-64 flex-shrink-0 space-y-sm rounded-xl border border-border bg-surface/95 p-md text-right shadow-sm transition-all duration-300 ease-out md:block md:sticky md:top-6 md:z-20',
        isFloating ? 'translate-x-0 opacity-100 shadow-lg' : '-translate-x-2 opacity-95',
      )}
    >
      <p className="text-sm font-semibold text-foreground">מקרא מדריכים</p>
      <div className="space-y-xs">
        <LegendEntries legend={legend} itemClassName="justify-between rounded-lg bg-muted/40 px-sm py-xxs" />
      </div>
    </div>
  )
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

function useInitialWeekStart() {
  return useMemo(() => formatUtcDate(startOfUtcWeek(new Date())), [])
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

function layoutDaySessions(day, window, { sessionDuration = SESSION_DURATION_MINUTES } = {}) {
  if (!day || !window) {
    return { chips: [], overflowBadges: [] }
  }

  const startMinutes = parseMinutes(window.startMinutes ?? window.start)
  const endMinutes = parseMinutes(window.endMinutes ?? window.end)
  if (startMinutes === null || endMinutes === null) {
    return { chips: [], overflowBadges: [] }
  }

  const duration = Math.max(15, Number(sessionDuration) || SESSION_DURATION_MINUTES)
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
    const top = (relativeStart / GRID_INTERVAL_MINUTES) * GRID_ROW_HEIGHT
    const end = timeMinutes + duration
    events.push({
      session,
      start: timeMinutes,
      end,
      top,
    })
  }

  if (!events.length) {
    return { chips: [], overflowBadges: [] }
  }

  events.sort((a, b) => {
    if (a.start !== b.start) {
      return a.start - b.start
    }
    return (a.session.studentName || '').localeCompare(b.session.studentName || '', 'he')
  })

  const clusters = []
  let currentCluster = null

  for (const event of events) {
    if (!currentCluster) {
      currentCluster = { events: [event], maxEnd: event.end }
      continue
    }

    if (event.start < currentCluster.maxEnd) {
      currentCluster.events.push(event)
      currentCluster.maxEnd = Math.max(currentCluster.maxEnd, event.end)
    } else {
      clusters.push(currentCluster)
      currentCluster = { events: [event], maxEnd: event.end }
    }
  }

  if (currentCluster) {
    clusters.push(currentCluster)
  }

  const chips = []
  const overflowBadges = []

  for (const cluster of clusters) {
    const columnEndTimes = []
    for (const event of cluster.events) {
      let assignedColumn = columnEndTimes.findIndex(end => event.start >= end)
      if (assignedColumn === -1) {
        assignedColumn = columnEndTimes.length
        columnEndTimes.push(event.end)
      } else {
        columnEndTimes[assignedColumn] = event.end
      }
      event.columnIndex = assignedColumn
    }

    const totalColumns = columnEndTimes.length || 1
    const visibleColumns = Math.min(totalColumns, MAX_VISIBLE_COLUMNS)
    const hiddenSessions = []

    const widthPercent = 100 / visibleColumns
    const visibleWidth = visibleColumns === 1
      ? '100%'
      : `calc(${widthPercent}% - ${COLUMN_GAP_PX}px)`
    const chipHeight = Math.max(
      GRID_ROW_HEIGHT - 8,
      GRID_ROW_HEIGHT * (duration / GRID_INTERVAL_MINUTES) - 8,
    )

    for (const event of cluster.events) {
      const shouldHide = totalColumns > MAX_VISIBLE_CHIPS && event.columnIndex >= MAX_VISIBLE_CHIPS
      const columnIndex = Math.min(event.columnIndex, visibleColumns - 1)
      const leftPercent = columnIndex * widthPercent
      const leftValue = visibleColumns === 1
        ? '0'
        : `calc(${leftPercent}% + ${COLUMN_GAP_PX / 2}px)`

      if (shouldHide) {
        hiddenSessions.push(event)
        continue
      }

      chips.push({
        session: event.session,
        top: Math.round(event.top),
        height: chipHeight,
        style: {
          left: leftValue,
          width: visibleColumns === 1 ? '100%' : visibleWidth,
        },
        zIndex: visibleColumns - columnIndex,
      })
    }

    if (hiddenSessions.length) {
      const firstHidden = hiddenSessions.reduce((prev, current) => (current.start < prev.start ? current : prev), hiddenSessions[0])
      const badgeLeftPercent = (visibleColumns - 1) * widthPercent
      const badgeLeft = visibleColumns === 1
        ? '0'
        : `calc(${badgeLeftPercent}% + ${COLUMN_GAP_PX / 2}px)`

      const overflowTop = Math.max(0, Math.round(firstHidden.top + chipHeight - 28))
      overflowBadges.push({
        sessions: hiddenSessions.map(entry => entry.session),
        top: overflowTop,
        height: chipHeight,
        style: {
          left: badgeLeft,
          width: visibleColumns === 1 ? '100%' : visibleWidth,
        },
        zIndex: visibleColumns + 1,
      })
    }
  }

  chips.sort((a, b) => a.top - b.top)
  overflowBadges.sort((a, b) => a.top - b.top)

  return { chips, overflowBadges }
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

function OverflowBadge({ sessions, top, height, style, zIndex, onNavigate, isCoarse }) {
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
  const computedStyle = useMemo(() => {
    const baseTop = top + (height || 0)
    const result = {
      top: `${baseTop}px`,
      transform: 'translateY(-100%)',
      zIndex,
    }
    if (typeof style?.left !== 'undefined') {
      result.left = style.left
    }
    if (style?.width) {
      result.maxWidth = style.width
    }
    return result
  }, [height, style?.left, style?.width, top, zIndex])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="absolute flex min-h-[28px] min-w-[64px] items-center justify-center rounded-full border border-dashed border-primary bg-primary/5 px-sm py-xxs text-xs font-semibold text-primary shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          style={computedStyle}
        >
          +{total} נוספים
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-60 space-y-sm rounded-lg border border-border bg-popover p-md text-right shadow-lg"
      >
        <p className="text-sm font-semibold text-foreground">תלמידים נוספים</p>
        <div className="space-y-xs">
          {sortedSessions.map(session => (
            <StudentChip
              key={`${session.studentId}-${session.time}`}
              session={session}
              variant="list"
              top={0}
              height={GRID_ROW_HEIGHT - 8}
              style={{}}
              zIndex={1}
              onNavigate={id => {
                setOpen(false)
                onNavigate(id)
              }}
              isCoarse={isCoarse}
            />
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
  const initialWeekStart = useInitialWeekStart()
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

  useEffect(() => {
    if (!data?.days?.length) {
      setSelectedDayIndex(0)
      return
    }

    const todayIndex = data.days.findIndex(day => day.date === data.today)
    if (todayIndex >= 0) {
      setSelectedDayIndex(todayIndex)
      return
    }

    setSelectedDayIndex(0)
  }, [data?.days, data?.today])

  const timeWindow = data?.timeWindow || null
  const gridSlots = useMemo(() => createGridSlots(timeWindow), [timeWindow])
  const gridHeight = gridSlots.length * GRID_ROW_HEIGHT
  const sessionDuration = data?.sessionDurationMinutes || SESSION_DURATION_MINUTES

  const legend = data?.legend || []
  const daysSource = data?.days
  const days = useMemo(() => (Array.isArray(daysSource) ? daysSource : []), [daysSource])

  const dayLayouts = useMemo(() => {
    const layoutMap = new Map()
    for (const day of days) {
      layoutMap.set(day.date, layoutDaySessions(day, timeWindow, { sessionDuration }))
    }
    return layoutMap
  }, [days, timeWindow, sessionDuration])

  const mobileSessionMaps = useMemo(() => {
    const result = new Map()
    for (const day of days) {
      result.set(day.date, groupSessionsForMobile(day, gridSlots))
    }
    return result
  }, [days, gridSlots])

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
    <Card ref={containerRef} className="relative rounded-2xl border border-border bg-surface p-lg shadow-sm">
      <div className="md:flex md:items-start md:gap-lg md:[direction:ltr]">
        <FloatingInstructorLegend legend={legend} />
        <div className="min-w-0 flex-1" dir="rtl">
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
          <InlineInstructorLegend legend={legend} isLoading={isLoading} />
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
                          className="sticky top-0 z-10 border-b border-border bg-muted/30 px-sm py-xs text-center text-sm font-medium text-foreground"
                        >
                          <span className="block text-base font-semibold">{display.label || '—'}</span>
                          <span className="mt-1 block text-xs font-normal text-muted-foreground">{display.date || '—'}</span>
                        </div>
                      )
                    })}
                    <div
                      className="relative border-l border-border"
                      style={{ height: `${gridHeight}px` }}
                    >
                      <div
                        className="grid text-sm text-muted-foreground"
                        style={{ gridTemplateRows: `repeat(${gridSlots.length}, ${GRID_ROW_HEIGHT}px)` }}
                      >
                        {gridSlots.map(minutes => (
                          <div
                            key={`time-${minutes}`}
                            className="flex items-start justify-end border-b border-border pr-sm pt-xxs"
                          >
                            {formatTimeLabel(minutes)}
                          </div>
                        ))}
                      </div>
                    </div>
                    {days.map(day => {
                      const layout = dayLayouts.get(day.date)
                      const chipItems = layout?.chips ?? []
                      const overflowItems = layout?.overflowBadges ?? []
                      return (
                        <div
                          key={`column-${day.date}`}
                          className="relative border-b border-l border-border bg-background/60"
                          style={{ height: `${gridHeight}px` }}
                        >
                          <div
                            className="grid"
                            aria-hidden="true"
                            style={{ gridTemplateRows: `repeat(${gridSlots.length}, ${GRID_ROW_HEIGHT}px)` }}
                          >
                            {gridSlots.map(minutes => (
                              <div
                                key={`${day.date}-row-${minutes}`}
                                className="border-b border-border/70"
                              />
                            ))}
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
                              key={`${day.date}-overflow-${item.top}`}
                              sessions={item.sessions}
                              top={item.top}
                              height={item.height}
                              style={item.style}
                              zIndex={item.zIndex}
                              onNavigate={handleNavigateToStudent}
                              isCoarse={isCoarsePointer}
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
      </div>
    </Card>
  )
}
