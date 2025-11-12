import React, { forwardRef, useEffect, useMemo, useState } from 'react'

import Card from '@/components/ui/CustomCard.jsx'
import { fetchInstructorLegend } from '@/api/weekly-compliance.js'
import { cn } from '@/lib/utils'

import { buildLegendStyle } from './color-utils.js'

function LegendList({ legend }) {
  if (!Array.isArray(legend) || legend.length === 0) {
    return null
  }

  return legend.map(item => (
    <div
      key={item.id}
      className="flex items-center justify-between gap-sm rounded-lg bg-muted/30 px-sm py-xxs text-sm text-foreground"
    >
      <span className="truncate" title={item.name}>
        {item.name}
      </span>
      <span className="flex items-center gap-xs text-xs">
        <span
          aria-hidden="true"
          className="inline-block h-3 w-3 shrink-0 rounded-full border border-border"
          style={buildLegendStyle(item.color, { inactive: item.isActive === false })}
        />
        {item.isActive === false ? (
          <span className="text-destructive">מדריך לא פעיל</span>
        ) : null}
      </span>
    </div>
  ))
}

const InstructorLegend = forwardRef(function InstructorLegend({ orgId, className, style }, ref) {
  const [legend, setLegend] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!orgId) {
      setLegend([])
      setError(null)
      return undefined
    }

    let isMounted = true
    const controller = new AbortController()

    setIsLoading(true)
    setError(null)

    fetchInstructorLegend({ orgId, signal: controller.signal })
      .then(result => {
        if (!isMounted) {
          return
        }
        setLegend(Array.isArray(result) ? result : [])
      })
      .catch(fetchError => {
        if (fetchError.name === 'AbortError') {
          return
        }
        if (!isMounted) {
          return
        }
        console.error('Failed to load instructor legend', fetchError)
        setError(fetchError)
        setLegend([])
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
  }, [orgId])

  const content = useMemo(() => {
    if (isLoading) {
      return (
        <p className="text-sm text-muted-foreground">טוען מדריכים...</p>
      )
    }

    if (error) {
      return (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-sm text-destructive">
          <p className="text-sm font-medium">אירעה שגיאה בטעינת רשימת המדריכים.</p>
          <p className="mt-xxs text-xs">נסו לרענן את הדף או לחזור מאוחר יותר.</p>
        </div>
      )
    }

    if (!legend.length) {
      return (
        <p className="text-sm text-muted-foreground">אין מדריכים להצגה.</p>
      )
    }

    return (
      <div className="space-y-xs">
        <LegendList legend={legend} />
      </div>
    )
  }, [error, isLoading, legend])

  return (
    <div ref={ref} className={cn('w-full', className)} style={style}>
      <Card className="rounded-2xl border border-border bg-surface p-lg shadow-sm">
        <h2 className="text-base font-semibold text-foreground">מקרא מדריכים</h2>
        <div className="mt-sm max-h-[calc(100vh-12rem)] space-y-sm overflow-y-auto">
          {content}
        </div>
      </Card>
    </div>
  )
})

export default InstructorLegend
