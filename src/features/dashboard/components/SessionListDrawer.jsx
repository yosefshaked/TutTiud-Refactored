import React, { useState } from 'react'
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
import NewSessionModal from '@/features/sessions/components/NewSessionModal'

export function SessionListDrawer({ isOpen, onClose, cellData, orgId }) {
  const navigate = useNavigate()
  const [quickDocModal, setQuickDocModal] = useState(null) // { studentId, date }
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

  function handleDocumentNow(studentId, date) {
    setQuickDocModal({ studentId, date })
  }

  function handleQuickDocComplete() {
    setQuickDocModal(null)
    onClose()
    // Optionally reload the compliance data
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
      <SheetContent side="left" className="w-full sm:max-w-lg">
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
                      className="relative flex items-center gap-3 p-4 rounded-lg border-2 border-border bg-card hover:bg-muted/50 transition-all hover:shadow-md"
                      dir="rtl"
                    >
                      {/* Instructor Color Bar */}
                      {session.instructorColor && (
                        <div
                          className="w-1.5 h-full absolute right-0 top-0 bottom-0 rounded-r-lg"
                          style={{ 
                            background: session.instructorColor.includes('gradient')
                              ? session.instructorColor.replace('gradient-', 'linear-gradient(135deg, ')
                              : session.instructorColor
                          }}
                        />
                      )}

                      {/* Session Info (Right side in RTL) */}
                      <div className="flex-1 min-w-0 text-right">
                        {/* Student Name (top) */}
                        <div className="mb-1">
                          <span className="font-semibold text-base truncate block">
                            {session.studentName}
                          </span>
                        </div>
                        
                        {/* Instructor Name with Color Dot (below student name) */}
                        {session.instructorName && (
                          <div className="flex items-center justify-end gap-2 mb-1">
                            <span className="text-sm text-muted-foreground">
                              {session.instructorName}
                            </span>
                            {session.instructorColor && (
                              <div
                                className="w-3 h-3 rounded-full border border-border shadow-sm flex-shrink-0"
                                style={{ 
                                  background: session.instructorColor.includes('gradient')
                                    ? session.instructorColor.replace('gradient-', 'linear-gradient(135deg, ')
                                    : session.instructorColor
                                }}
                              />
                            )}
                          </div>
                        )}
                        
                        {/* Status Text */}
                        <div className={`text-xs font-medium ${getStatusColor(session)}`}>
                          {getStatusText(session)}
                        </div>
                      </div>

                      {/* Status Icon */}
                      <div className={`text-2xl flex-shrink-0 ${getStatusColor(session)}`}>
                        {getStatusIcon(session)}
                      </div>

                      {/* Action Buttons (Left side in RTL) */}
                      <div className="flex gap-2 flex-shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleViewStudent(session.studentId)}
                        >
                          פתח
                        </Button>
                        {session.status === 'missing' && (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleDocumentNow(session.studentId, cellData.date)}
                          >
                            תעד עכשיו
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </SheetContent>

      {/* Quick Documentation Modal */}
      {quickDocModal && (
        <NewSessionModal
          open={!!quickDocModal}
          onClose={() => setQuickDocModal(null)}
          initialStudentId={quickDocModal.studentId}
          initialDate={quickDocModal.date}
          onCreated={handleQuickDocComplete}
        />
      )}
    </Sheet>
  )
}
