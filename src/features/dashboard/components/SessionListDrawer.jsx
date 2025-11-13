import React from 'react'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'
import { useNavigate } from 'react-router-dom'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'

export function SessionListDrawer({ isOpen, onClose, cellData, orgId }) {
  const navigate = useNavigate()
  // Intentionally unused for now; keep in signature for future enhancements
  void orgId

  if (!cellData) return null

  const dateObj = new Date(cellData.date)
  const dayName = format(dateObj, 'EEEE', { locale: he })
  const fullDate = format(dateObj, 'dd.MM.yyyy', { locale: he })

  // Group sessions by exact time
  const sessionsByTime = cellData.sessions.reduce((acc, session) => {
    const time = session.time || (typeof session.timeMinutes === 'number' ? `${String(Math.floor(session.timeMinutes/60)).padStart(2,'0')}:${String(session.timeMinutes%60).padStart(2,'0')}` : '00:00')
    if (!acc[time]) acc[time] = []
    acc[time].push(session)
    return acc
  }, {})

  const sortedTimes = Object.keys(sessionsByTime).sort()

  function handleDocumentNow(studentId) {
    navigate(`/students/${studentId}`)
    onClose()
  }

  function handleViewStudent(studentId) {
    navigate(`/students/${studentId}`)
    onClose()
  }

  function getStatusIcon(session) {
    if (session.status === 'upcoming') return '⚠'
    if (session.status === 'missing') return '✗'
    return '✓'
  }

  function getStatusColor(session) {
    if (session.status === 'upcoming') return 'text-muted-foreground'
    if (session.status === 'missing') return 'text-red-600 dark:text-red-400'
    return 'text-green-600 dark:text-green-400'
  }

  function getStatusText(session) {
    if (session.status === 'upcoming') return 'קרוב'
    if (session.status === 'missing') return 'חסר תיעוד'
    return 'מתועד'
  }

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="text-right">
            {dayName} {fullDate} | {cellData.timeSlot}
          </SheetTitle>
          <SheetDescription className="text-right">
            {cellData.documented} מתועדים מתוך {cellData.total} שיעורים
            {cellData.upcoming > 0 && ` (${cellData.upcoming} קרובים)`}
          </SheetDescription>
        </SheetHeader>

        <div className="h-[calc(100vh-180px)] mt-6 overflow-y-auto">
          <div className="space-y-6 pr-4">
            {sortedTimes.map(time => (
              <div key={time}>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3 sticky top-0 bg-background py-2">
                  {time}
                </h3>
                <div className="space-y-3">
                  {sessionsByTime[time].map(session => (
                    <div
                      key={session.id}
                      className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors"
                    >
                      {/* Status Icon */}
                      <div className={`text-xl ${getStatusColor(session)}`}>
                        {getStatusIcon(session)}
                      </div>

                      {/* Session Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm truncate">
                            {session.studentName}
                          </span>
                          {session.instructorName && (
                            <span className="text-xs text-muted-foreground">
                              ← {session.instructorName}
                            </span>
                          )}
                        </div>
                        <div className={`text-xs ${getStatusColor(session)}`}>
                          {getStatusText(session)}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-2">
                        {session.status === 'missing' && (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleDocumentNow(session.studentId)}
                          >
                            תעד עכשיו
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleViewStudent(session.studentId)}
                        >
                          פתח
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
