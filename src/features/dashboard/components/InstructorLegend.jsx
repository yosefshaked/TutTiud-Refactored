import React, { useEffect, useMemo, useState } from 'react'

import { fetchInstructorLegend } from '@/api/weekly-compliance.js'

import { buildLegendStyle } from './color-utils.js'

/**
 * Horizontal instructor legend bar - integrated into calendar header.
 * Displays instructor names with color swatches in a clean, compact format.
 */
export default function InstructorLegend({ orgId }) {
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
        <p className="text-xs text-muted-foreground">טוען מדריכים...</p>
      )
    }

    if (error) {
      return (
        <p className="text-xs text-destructive">שגיאה בטעינת רשימת המדריכים</p>
      )
    }

    if (!legend.length) {
      return (
        <p className="text-xs text-muted-foreground">אין מדריכים להצגה</p>
      )
    }

    return (
      <div className="flex flex-wrap items-center gap-md">
        <span className="text-xs font-semibold text-muted-foreground">מקרא מדריכים:</span>
        {legend.map(item => (
          <div
            key={item.id}
            className="flex items-center gap-xs"
          >
            <span
              aria-hidden="true"
              className="inline-block h-3 w-3 shrink-0 rounded-full border border-border shadow-sm"
              style={buildLegendStyle(item.color, { inactive: item.isActive === false })}
            />
            <span className="text-xs text-foreground" title={item.name}>
              {item.name}
              {item.isActive === false ? ' (לא פעיל)' : ''}
            </span>
          </div>
        ))}
      </div>
    )
  }, [error, isLoading, legend])

  return (
    <div className="border-b border-border bg-surface/95 px-lg py-sm backdrop-blur-sm">
      {content}
    </div>
  )
}
