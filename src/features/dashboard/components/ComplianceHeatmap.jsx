import React, { useState, useEffect, useMemo } from 'react'
import { format, startOfWeek, addDays } from 'date-fns'
import { he } from 'date-fns/locale'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { fetchWeeklyComplianceView } from '@/api/weekly-compliance'
import InstructorLegend from './InstructorLegend'
import { SessionListDrawer } from './SessionListDrawer'
import { DayTimelineView } from './DayTimelineView'

export function ComplianceHeatmap({ orgId }) {
  const [data, setData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedCell, setSelectedCell] = useState(null)
  const [showTimeline, setShowTimeline] = useState(false)
  const [timelineDate, setTimelineDate] = useState(null)
  const [currentWeekStart, setCurrentWeekStart] = useState(() => 
    startOfWeek(new Date(), { locale: he, weekStartsOn: 0 })
  )

  useEffect(() => {
    loadData()
  }, [orgId, currentWeekStart])

  async function loadData() {
    setIsLoading(true)
    setError(null)
    try {
      const result = await fetchWeeklyComplianceView(orgId, currentWeekStart)
      setData(result)
    } catch (err) {
      console.error('Failed to load compliance data:', err)
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const heatmapData = useMemo(() => {
    if (!data?.days) return null

    // Extract unique time slots across all days
    const allTimeSlots = new Set()
    data.days.forEach(day => {
      day.sessions.forEach(session => {
        const hour = session.time_slot.split(':')[0]
        allTimeSlots.add(`${hour}:00`)
      })
    })

    const sortedSlots = Array.from(allTimeSlots).sort()

    // Build grid data
    const grid = sortedSlots.map(timeSlot => {
      const row = { timeSlot, days: [] }
      
      data.days.forEach(day => {
        const sessionsInSlot = day.sessions.filter(s => {
          const sessionHour = s.time_slot.split(':')[0]
          return `${sessionHour}:00` === timeSlot
        })

        const total = sessionsInSlot.length
        const documented = sessionsInSlot.filter(s => !s.is_missing).length
        const upcoming = sessionsInSlot.filter(s => s.is_upcoming).length
        const missing = total - documented - upcoming

        row.days.push({
          date: day.date,
          total,
          documented,
          upcoming,
          missing,
          sessions: sessionsInSlot,
          complianceRate: total > 0 ? (documented / (total - upcoming)) * 100 : null
        })
      })

      return row
    })

    return { grid, sortedSlots }
  }, [data])

  function getComplianceColor(complianceRate, hasUpcoming, total) {
    if (total === 0) return 'bg-muted/30 text-muted-foreground'
    if (complianceRate === null || isNaN(complianceRate)) {
      // All upcoming
      return 'bg-muted/50 text-muted-foreground'
    }
    if (complianceRate >= 80) return 'bg-green-100 dark:bg-green-950 text-green-900 dark:text-green-100 border-green-300 dark:border-green-800'
    if (complianceRate >= 50) return 'bg-yellow-100 dark:bg-yellow-950 text-yellow-900 dark:text-yellow-100 border-yellow-300 dark:border-yellow-800'
    return 'bg-red-100 dark:bg-red-950 text-red-900 dark:text-red-100 border-red-300 dark:border-red-800'
  }

  function handleCellClick(timeSlot, dayData) {
    if (dayData.total === 0) return
    setSelectedCell({ timeSlot, ...dayData })
  }

  function handleShowTimeline(date) {
    setTimelineDate(date)
    setShowTimeline(true)
  }

  function navigateWeek(direction) {
    setCurrentWeekStart(prev => addDays(prev, direction === 'next' ? 7 : -7))
  }

  if (showTimeline && timelineDate) {
    return (
      <DayTimelineView
        orgId={orgId}
        date={timelineDate}
        onBack={() => setShowTimeline(false)}
      />
    )
  }

  return (
    <Card className="w-full">
      <div className="p-lg">
        {/* Header */}
        <div className="flex items-center justify-between mb-md">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">תצוגת ציות שבועית</h2>
            <p className="mt-xs text-sm text-muted-foreground">
              מעקב אחר מילוי תיעוד שיעורים לפי שעות
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigateWeek('prev')}
            >
              ‹ שבוע קודם
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentWeekStart(startOfWeek(new Date(), { locale: he, weekStartsOn: 0 }))}
            >
              השבוע
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigateWeek('next')}
            >
              שבוע הבא ›
            </Button>
          </div>
        </div>

        {/* Instructor Legend */}
        <div className="mb-md">
          <InstructorLegend orgId={orgId} />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-xl">
            <span className="text-sm text-muted-foreground">טוען נתוני ציות...</span>
          </div>
        ) : error ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-lg text-destructive">
            <p className="text-base font-semibold">אירעה שגיאה בטעינת הנתונים.</p>
            <p className="mt-xs text-sm">{error}</p>
          </div>
        ) : !heatmapData ? (
          <p className="text-sm text-muted-foreground">אין נתונים להצגה</p>
        ) : (
          <>
            {/* Heatmap Grid */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b-2 border-border">
                    <th className="sticky right-0 bg-surface px-4 py-3 text-right font-semibold text-sm">
                      שעה
                    </th>
                    {data.days.map(day => {
                      const dateObj = new Date(day.date)
                      const dayName = format(dateObj, 'EEEE', { locale: he })
                      const shortDate = format(dateObj, 'dd.MM', { locale: he })
                      return (
                        <th key={day.date} className="px-4 py-3 text-center border-r border-border min-w-[140px]">
                          <div className="flex flex-col gap-1">
                            <div className="font-semibold text-sm">{dayName}</div>
                            <div className="text-xs text-muted-foreground">{shortDate}</div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-xs mt-1"
                              onClick={() => handleShowTimeline(day.date)}
                            >
                              תצוגה מפורטת
                            </Button>
                          </div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {heatmapData.grid.map((row, idx) => (
                    <tr key={row.timeSlot} className={idx % 2 === 0 ? 'bg-muted/20' : ''}>
                      <td className="sticky right-0 bg-surface px-4 py-3 text-right font-medium text-sm border-b border-border">
                        {row.timeSlot}
                      </td>
                      {row.days.map((dayData, dayIdx) => (
                        <td
                          key={dayIdx}
                          className="px-2 py-2 text-center border-r border-b border-border"
                        >
                          {dayData.total > 0 ? (
                            <button
                              onClick={() => handleCellClick(row.timeSlot, dayData)}
                              className={`w-full rounded-lg border p-3 transition-all hover:scale-105 hover:shadow-md cursor-pointer ${getComplianceColor(dayData.complianceRate, dayData.upcoming > 0, dayData.total)}`}
                            >
                              <div className="flex flex-col gap-1">
                                {/* Status Icons */}
                                <div className="flex items-center justify-center gap-1 text-xs mb-1">
                                  {dayData.documented > 0 && (
                                    <span className="text-green-600 dark:text-green-400">
                                      ✓×{dayData.documented}
                                    </span>
                                  )}
                                  {dayData.missing > 0 && (
                                    <span className="text-red-600 dark:text-red-400">
                                      ✗×{dayData.missing}
                                    </span>
                                  )}
                                  {dayData.upcoming > 0 && (
                                    <span className="text-muted-foreground">
                                      ⚠×{dayData.upcoming}
                                    </span>
                                  )}
                                </div>
                                {/* Ratio */}
                                <div className="font-semibold text-sm">
                                  {dayData.documented}/{dayData.total}
                                </div>
                                {/* Percentage */}
                                {dayData.complianceRate !== null && !isNaN(dayData.complianceRate) && (
                                  <div className="text-xs font-medium">
                                    {Math.round(dayData.complianceRate)}%
                                  </div>
                                )}
                              </div>
                            </button>
                          ) : (
                            <div className="text-muted-foreground text-sm py-3">-</div>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {/* Daily Summary Row */}
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/30">
                    <td className="sticky right-0 bg-muted/30 px-4 py-3 text-right font-semibold text-sm">
                      סה"כ יומי
                    </td>
                    {data.days.map(day => {
                      const totalSessions = day.sessions.length
                      const documented = day.sessions.filter(s => !s.is_missing && !s.is_upcoming).length
                      const upcoming = day.sessions.filter(s => s.is_upcoming).length
                      const rate = totalSessions - upcoming > 0 
                        ? Math.round((documented / (totalSessions - upcoming)) * 100)
                        : null
                      
                      return (
                        <td key={day.date} className="px-4 py-3 text-center border-r border-border font-semibold text-sm">
                          <div className="flex flex-col gap-1">
                            <div>{documented}/{totalSessions}</div>
                            {rate !== null && <div className="text-xs">{rate}%</div>}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Legend */}
            <div className="mt-md flex items-center justify-center gap-4 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-green-100 dark:bg-green-950 border border-green-300 dark:border-green-800"></div>
                <span>≥80% ציות טוב</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-yellow-100 dark:bg-yellow-950 border border-yellow-300 dark:border-yellow-800"></div>
                <span>50-79% דרוש תשומת לב</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-red-100 dark:bg-red-950 border border-red-300 dark:border-red-800"></div>
                <span>&lt;50% פערים משמעותיים</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-muted/50 border border-border"></div>
                <span>טרם התרחש</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Session List Drawer */}
      {selectedCell && (
        <SessionListDrawer
          isOpen={!!selectedCell}
          onClose={() => setSelectedCell(null)}
          cellData={selectedCell}
          orgId={orgId}
        />
      )}
    </Card>
  )
}
