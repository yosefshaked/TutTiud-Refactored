import React, { useState, useEffect, useMemo } from 'react'
import { format, startOfWeek, addDays } from 'date-fns'
import { he } from 'date-fns/locale'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { fetchWeeklyComplianceView } from '@/api/weekly-compliance'
import { fetchDailyCompliance } from '@/api/daily-compliance.js'
import { SessionListDrawer } from './SessionListDrawer'
import DayDetailView from './DayDetailView.jsx'

export function ComplianceHeatmap({ orgId }) {
  const [data, setData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedCell, setSelectedCell] = useState(null)
  const [detailedDayData, setDetailedDayData] = useState(null)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState(null)
  const [detailRequestDate, setDetailRequestDate] = useState(null)
  const [currentWeekStart, setCurrentWeekStart] = useState(() =>
    startOfWeek(new Date(), { locale: he, weekStartsOn: 0 })
  )

  const detailDateLabel = useMemo(() => {
    if (!detailRequestDate) {
      return ''
    }
    try {
      return format(new Date(detailRequestDate), 'PPP', { locale: he })
    } catch {
      return detailRequestDate
    }
  }, [detailRequestDate])

  useEffect(() => {
    ;(async () => {
      setIsLoading(true)
      setError(null)
      try {
        const result = await fetchWeeklyComplianceView({
          orgId,
          weekStart: format(currentWeekStart, 'yyyy-MM-dd'),
        })
        setData(result)
      } catch (err) {
        console.error('Failed to load compliance data:', err)
        setError(err.message)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [orgId, currentWeekStart])

  const heatmapData = useMemo(() => {
    if (!data?.days) return null

    // Extract unique time slots across all days (group to hours)
    const allTimeSlots = new Set()
    const getHourString = (s) => {
      if (!s) return null
      const t = s.time
      if (typeof t === 'string' && /^\d{2}:\d{2}/.test(t)) {
        return `${t.slice(0, 2)}:00`
      }
      const m = Number(s.timeMinutes)
      if (Number.isFinite(m)) {
        const h = Math.floor(m / 60)
        return `${String(h).padStart(2, '0')}:00`
      }
      return null
    }
    data.days.forEach(day => {
      day.sessions.forEach(session => {
        const hourSlot = getHourString(session)
        if (hourSlot) allTimeSlots.add(hourSlot)
      })
    })

    const sortedSlots = Array.from(allTimeSlots).sort()

    // Build grid data
    const grid = sortedSlots.map(timeSlot => {
      const row = { timeSlot, days: [] }
      
      data.days.forEach(day => {
        const sessionsInSlot = day.sessions.filter(s => {
          const hourSlot = getHourString(s)
          return hourSlot === timeSlot
        })

        const total = sessionsInSlot.length
        const documented = sessionsInSlot.filter(s => s.status === 'complete').length
        const upcoming = sessionsInSlot.filter(s => s.status === 'upcoming').length
        const missing = sessionsInSlot.filter(s => s.status === 'missing').length

        row.days.push({
          date: day.date,
          total,
          documented,
          upcoming,
          missing,
          sessions: sessionsInSlot,
          complianceRate: total - upcoming > 0 ? (documented / (total - upcoming)) * 100 : null
        })
      })

      return row
    })

    return { grid, sortedSlots }
  }, [data])

  // Returns the stripe color for a cell, using the simplified palette
  function getStripeColor(complianceRate, total) {
    // No sessions or all upcoming → neutral gray
    if (total === 0 || complianceRate === null || isNaN(complianceRate)) {
      return '#E5E7EB'
    }
    if (complianceRate === 100) return '#22C55E' // Success Green (only 100%)
    if (complianceRate >= 76) return '#FACC15' // Warning Yellow (76-99%)
    return '#F97316' // Warning Orange
  }

  function handleCellClick(timeSlot, dayData) {
    if (dayData.total === 0) return
    setSelectedCell({ timeSlot, ...dayData })
  }

  async function handleShowDetailedDay(date) {
    if (!date || !orgId) {
      return
    }
    setDetailRequestDate(date)
    setDetailError(null)
    setDetailedDayData(null)
    setIsDetailLoading(true)
    try {
      const result = await fetchDailyCompliance({ orgId, date })
      setDetailedDayData(result)
    } catch (detailErr) {
      console.error('Failed to load detailed day view:', detailErr)
      setDetailError(detailErr?.message || 'אירעה שגיאה בעת טעינת נתוני היום.')
    } finally {
      setIsDetailLoading(false)
    }
  }

  function navigateWeek(direction) {
    setCurrentWeekStart(prev => addDays(prev, direction === 'next' ? 7 : -7))
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
                        <th key={day.date} className="px-3 py-3 text-center border-r border-border min-w-[150px]">
                          <div className="flex flex-col gap-2">
                            <div className="font-semibold text-base">{dayName}</div>
                            <div className="text-xs text-muted-foreground">{shortDate}</div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs mt-1 bg-primary/5 hover:bg-primary/10 border-primary/30 hover:border-primary/50 font-semibold"
                              onClick={() => handleShowDetailedDay(day.date)}
                            >
                              📊 תצוגה מפורטת
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
                          className="px-3 py-3 text-center border-r border-b border-border"
                        >
                          {dayData.total > 0 ? (
                            <button
                              onClick={() => handleCellClick(row.timeSlot, dayData)}
                              className="relative w-full rounded-lg border-2 p-4 transition-all hover:scale-105 hover:shadow-lg cursor-pointer bg-card text-foreground"
                            >
                              {/* Colored stripe on the right */}
                              <div
                                className="absolute right-0 top-0 bottom-0 w-1.5 rounded-r-lg"
                                style={{ backgroundColor: getStripeColor(dayData.complianceRate, dayData.total) }}
                                aria-hidden
                              />
                              <div className="flex flex-col gap-1">
                                {/* Status Icons */}
                                <div className="flex items-center justify-center gap-2 text-xs font-semibold leading-tight opacity-90">
                                  {dayData.documented > 0 && (
                                    <span>
                                      ✓×{dayData.documented}
                                    </span>
                                  )}
                                  {dayData.missing > 0 && (
                                    <span>
                                      ✗×{dayData.missing}
                                    </span>
                                  )}
                                  {dayData.upcoming > 0 && (
                                    <span>
                                      ⚠×{dayData.upcoming}
                                    </span>
                                  )}
                                </div>
                                {/* Ratio */}
                                <div className="font-bold text-base leading-tight">
                                  {dayData.documented}/{dayData.total}
                                </div>
                                {/* Percentage */}
                                {dayData.complianceRate !== null && !isNaN(dayData.complianceRate) && (
                                  <div className="text-sm font-bold leading-tight">
                                    {Math.round(dayData.complianceRate)}%
                                  </div>
                                )}
                              </div>
                            </button>
                          ) : (
                            <div className="text-muted-foreground text-sm py-4">-</div>
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
                      const documented = day.sessions.filter(s => s.status === 'complete').length
                      const upcoming = day.sessions.filter(s => s.status === 'upcoming').length
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
            <div className="mt-md flex items-center justify-center gap-6 text-xs font-medium">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-[#22C55E] border border-[#22C55E]"></div>
                <span>100% ציות מושלם</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-[#FACC15] border border-[#FACC15]"></div>
                <span>76-99% דרוש תשומת לב</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-[#F97316] border border-[#F97316]"></div>
                <span>0-75% דורש טיפול</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-[#E5E7EB] border border-gray-300"></div>
                <span>ללא שיעורים / טרם התרחש</span>
              </div>
            </div>
          </>
        )}
        {isDetailLoading ? (
          <div className="mt-sm text-center text-xs text-muted-foreground" role="status">
            טוען תצוגת יום מפורטת{detailDateLabel ? ` (${detailDateLabel})` : ''}...
          </div>
        ) : null}
        {detailError ? (
          <div className="mt-sm rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            {detailError}
          </div>
        ) : null}
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
      {detailedDayData ? (
        <DayDetailView
          dayData={detailedDayData}
          onClose={() => {
            setDetailedDayData(null)
            setDetailRequestDate(null)
          }}
        />
      ) : null}
    </Card>
  )
}
