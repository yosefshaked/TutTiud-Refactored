import React, {
  useEffect,
  useRef,
  useState,
} from 'react'

import { cn } from '@/lib/utils'

import { buildLegendStyle } from './color-utils.js'

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

export function InlineInstructorLegend({ legend, isLoading }) {
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

export function FloatingInstructorLegend({ legend }) {
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
    <div className="hidden md:block mb-md" aria-hidden="false">
      <div
        ref={legendRef}
        className={cn(
          'sticky top-6 z-30 w-[16rem] max-w-full space-y-sm rounded-xl border border-border bg-surface/95 p-md text-right shadow-sm transition-all duration-300 ease-out',
          isFloating ? 'translate-y-0 opacity-100 shadow-lg' : 'translate-y-2 opacity-90',
        )}
        style={{ maxHeight: 'calc(100vh - 3rem)' }}
      >
        <p className="text-sm font-semibold text-foreground">מקרא מדריכים</p>
        <div className="space-y-xs">
          <LegendEntries legend={legend} itemClassName="justify-between rounded-lg bg-muted/40 px-sm py-xxs" />
        </div>
      </div>
    </div>
  )
}
