import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const A11yContext = createContext(null)

const STORAGE_KEYS = {
  fontScale: 'a11y:fontScale',
  highContrast: 'a11y:highContrast',
  textSpacing: 'a11y:textSpacing',
  underlineLinks: 'a11y:underlineLinks',
  dyslexiaFont: 'a11y:dyslexiaFont',
}

const A11Y_STYLE_ID = 'a11y-dynamic-styles'
const A11Y_CSS = `
/**************** Accessibility helpers: text spacing, underline links, dyslexia-friendly font ***************/
@layer base {
  /* Text spacing increases letter/word spacing and line-height across body text. */
  .a11y-text-spacing {
    --a11y-letter-spacing: 0.12em;
    --a11y-word-spacing: 0.16em;
    --a11y-line-height: 1.75;
  }
  .a11y-text-spacing body,
  .a11y-text-spacing .prose,
  .a11y-text-spacing *:where(p,li,span,a,button,label,small,strong,em) {
    letter-spacing: var(--a11y-letter-spacing);
    word-spacing: var(--a11y-word-spacing);
    line-height: var(--a11y-line-height);
  }

  /* Always underline links for clearer affordance. */
  .a11y-underline-links a[href] {
    text-decoration: underline;
    text-underline-offset: 0.15em;
    text-decoration-thickness: 2px;
  }

  /* Dyslexia-friendly font family. To fully enable, bundle a font like OpenDyslexic/Atkinson Hyperlegible. */
  .a11y-dyslexia-font body {
    font-family: 'OpenDyslexic', 'Atkinson Hyperlegible', Nunito, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, 'Apple Color Emoji', 'Segoe UI Emoji';
  }
}
`

function ensureA11yStylesInjected() {
  if (typeof document === 'undefined') return
  if (document.getElementById(A11Y_STYLE_ID)) return
  try {
    const style = document.createElement('style')
    style.id = A11Y_STYLE_ID
    style.textContent = A11Y_CSS
    document.head.appendChild(style)
  } catch (err) {
    console.warn('[a11y] Failed to inject dynamic styles', err)
  }
}

function applyFontScale(scale) {
  const clamped = Math.min(1.4, Math.max(0.9, Number(scale) || 1))
  document.documentElement.style.setProperty('--a11y-font-scale', String(clamped))
}

function applyHighContrast(enabled) {
  const root = document.documentElement
  if (enabled) root.classList.add('a11y-hc')
  else root.classList.remove('a11y-hc')
}

function applyTextSpacing(enabled) {
  const root = document.documentElement
  root.classList.toggle('a11y-text-spacing', Boolean(enabled))
}

function applyUnderlineLinks(enabled) {
  const root = document.documentElement
  root.classList.toggle('a11y-underline-links', Boolean(enabled))
}

function applyDyslexiaFont(enabled) {
  const root = document.documentElement
  root.classList.toggle('a11y-dyslexia-font', Boolean(enabled))
}

export function AccessibilityProvider({ children }) {
  const [fontScale, setFontScaleState] = useState(1)
  const [highContrast, setHighContrastState] = useState(false)
  const [textSpacing, setTextSpacingState] = useState(false)
  const [underlineLinks, setUnderlineLinksState] = useState(false)
  const [dyslexiaFont, setDyslexiaFontState] = useState(false)

  // Inject dynamic styles once
  useEffect(() => { ensureA11yStylesInjected() }, [])

  // Load settings once
  useEffect(() => {
    try {
      const storedScale = parseFloat(localStorage.getItem(STORAGE_KEYS.fontScale) || '1')
      const storedHc = localStorage.getItem(STORAGE_KEYS.highContrast) === '1'
      const storedTs = localStorage.getItem(STORAGE_KEYS.textSpacing) === '1'
      const storedUl = localStorage.getItem(STORAGE_KEYS.underlineLinks) === '1'
      const storedDf = localStorage.getItem(STORAGE_KEYS.dyslexiaFont) === '1'

      setFontScaleState(Number.isFinite(storedScale) ? storedScale : 1)
      setHighContrastState(Boolean(storedHc))
      setTextSpacingState(Boolean(storedTs))
      setUnderlineLinksState(Boolean(storedUl))
      setDyslexiaFontState(Boolean(storedDf))

      applyFontScale(storedScale)
      applyHighContrast(storedHc)
      applyTextSpacing(storedTs)
      applyUnderlineLinks(storedUl)
      applyDyslexiaFont(storedDf)
    } catch (err) {
      // noop: fallback to defaults when storage is unavailable
      console.warn('[a11y] Failed to load preferences', err)
      applyFontScale(1)
      applyHighContrast(false)
      applyTextSpacing(false)
      applyUnderlineLinks(false)
      applyDyslexiaFont(false)
    }
  }, [])

  const setFontScale = useCallback((next) => {
    const value = Math.min(1.4, Math.max(0.9, Number(next) || 1))
    setFontScaleState(value)
    try { localStorage.setItem(STORAGE_KEYS.fontScale, String(value)) } catch (err) { console.warn('[a11y] Failed to save font scale', err) }
    applyFontScale(value)
  }, [])

  const increaseFont = useCallback(() => setFontScale((fontScale || 1) + 0.1), [setFontScale, fontScale])
  const decreaseFont = useCallback(() => setFontScale((fontScale || 1) - 0.1), [setFontScale, fontScale])

  const toggleHighContrast = useCallback(() => {
    setHighContrastState((prev) => {
      const next = !prev
      try { localStorage.setItem(STORAGE_KEYS.highContrast, next ? '1' : '0') } catch (err) { console.warn('[a11y] Failed to save contrast preference', err) }
      applyHighContrast(next)
      return next
    })
  }, [])

  const toggleTextSpacing = useCallback(() => {
    setTextSpacingState((prev) => {
      const next = !prev
      try { localStorage.setItem(STORAGE_KEYS.textSpacing, next ? '1' : '0') } catch (err) { console.warn('[a11y] Failed to save text spacing', err) }
      applyTextSpacing(next)
      return next
    })
  }, [])

  const toggleUnderlineLinks = useCallback(() => {
    setUnderlineLinksState((prev) => {
      const next = !prev
      try { localStorage.setItem(STORAGE_KEYS.underlineLinks, next ? '1' : '0') } catch (err) { console.warn('[a11y] Failed to save underline links', err) }
      applyUnderlineLinks(next)
      return next
    })
  }, [])

  const toggleDyslexiaFont = useCallback(() => {
    setDyslexiaFontState((prev) => {
      const next = !prev
      try { localStorage.setItem(STORAGE_KEYS.dyslexiaFont, next ? '1' : '0') } catch (err) { console.warn('[a11y] Failed to save dyslexia font', err) }
      applyDyslexiaFont(next)
      return next
    })
  }, [])

  const reset = useCallback(() => {
    setFontScale(1)
    setHighContrastState(false)
    setTextSpacingState(false)
    setUnderlineLinksState(false)
    setDyslexiaFontState(false)
    try {
      localStorage.removeItem(STORAGE_KEYS.fontScale)
      localStorage.removeItem(STORAGE_KEYS.highContrast)
      localStorage.removeItem(STORAGE_KEYS.textSpacing)
      localStorage.removeItem(STORAGE_KEYS.underlineLinks)
      localStorage.removeItem(STORAGE_KEYS.dyslexiaFont)
    } catch (err) {
      console.warn('[a11y] Failed to clear preferences', err)
    }
    applyHighContrast(false)
    applyTextSpacing(false)
    applyUnderlineLinks(false)
    applyDyslexiaFont(false)
  }, [setFontScale])

  const value = useMemo(() => ({
    fontScale,
    setFontScale,
    increaseFont,
    decreaseFont,

    highContrast,
    toggleHighContrast,

    textSpacing,
    toggleTextSpacing,

    underlineLinks,
    toggleUnderlineLinks,

    dyslexiaFont,
    toggleDyslexiaFont,

    reset,
  }), [fontScale, setFontScale, increaseFont, decreaseFont, highContrast, toggleHighContrast, textSpacing, toggleTextSpacing, underlineLinks, toggleUnderlineLinks, dyslexiaFont, toggleDyslexiaFont, reset])

  return (
    <A11yContext.Provider value={value}>
      {children}
    </A11yContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAccessibility() {
  const ctx = useContext(A11yContext)
  if (!ctx) throw new Error('useAccessibility must be used within AccessibilityProvider')
  return ctx
}
