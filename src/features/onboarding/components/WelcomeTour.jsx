import React, { useEffect, useMemo, useRef } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import '../styles/tour.css';
import { useUserRole } from '../hooks/useUserRole.js';
import { useOnboardingStatus } from '../hooks/useOnboardingStatus.js';
import { getTourSteps } from './TourSteps.jsx';

/**
 * WelcomeTour - Interactive onboarding tour for new users
 * Automatically shows on first login, adapts to user role
 */
export function WelcomeTour() {
  const { isAdmin } = useUserRole();
  const { completed, loading, markCompleted } = useOnboardingStatus();
  const driverRef = useRef(null);
  const teardownRef = useRef({ esc: null, overlay: null, doc: null, bound: new WeakSet() });
  const finalizedRef = useRef(false);

  const steps = useMemo(() => getTourSteps(isAdmin), [isAdmin]);

  useEffect(() => {
    if (loading || completed) return undefined;

    // Small delay to let UI render before positioning targets
    const timer = setTimeout(() => {
      if (driverRef.current) {
        try {
          driverRef.current.destroy();
        } catch {
          // noop: the instance might already be cleaned up
        }
      }

      driverRef.current = driver({
        showProgress: true,
        progressText: '{{current}} מתוך {{total}}',
        allowClose: true,
        nextBtnText: 'הבא',
        prevBtnText: 'הקודם',
        doneBtnText: 'סיום',
        closeBtnAriaLabel: 'סגור',
        animate: true,
        smoothScroll: true,
        overlayOpacity: 0.6,
        overlayColor: '#000000',
        stageRadius: 12,
        stagePadding: 8,
        popoverClass: 'driverjs-theme',
        onHighlightStarted: (element, step, options) => {
          // Add data attributes for progress gauge
          const popover = document.querySelector('.driver-popover');
          if (popover && options.state) {
            popover.setAttribute('data-current-step', options.state.activeIndex + 1);
            popover.setAttribute('data-total-steps', steps.length);
            // Defensive bindings: ensure X and Done always close; Next closes on last step
            const bindClick = (el, fn) => {
              if (!el) return;
              const bound = teardownRef.current.bound;
              if (bound.has(el)) return;
              // use capture so our handler runs even if the lib stops propagation
              el.addEventListener('click', fn, { capture: true });
              bound.add(el);
            };

            const forceDestroy = (reason) => {
              // Defer to avoid racing internal driver click handlers
              setTimeout(() => {
                if (finalizedRef.current) return;
                try {
                  if (window.__TT_TOUR_DEBUG__) console.info('[tour] forceDestroy:', reason);
                  driverRef.current?.destroy();
                } catch {}
                // Fallback: if popover/overlay still present after a short delay, hard-remove
                setTimeout(() => {
                  if (finalizedRef.current) return;
                  const stillThere = document.querySelector('.driver-overlay') || document.querySelector('.driver-popover');
                  if (stillThere) {
                    try {
                      document.querySelectorAll('.driver-overlay,.driver-popover').forEach(n => n.remove());
                      document.querySelectorAll('.driver-active-element,.driver-highlighted-element')
                        .forEach((el) => {
                          el.classList.remove('driver-active-element','driver-highlighted-element');
                          el.style.removeProperty('z-index');
                          el.style.removeProperty('position');
                        });
                    } catch {}
                  }
                }, 200);
              }, 0);
            };

            const isLast = options?.state?.activeIndex === steps.length - 1;
            const nextBtn = popover.querySelector('.driver-popover-next-btn');
            const doneBtn = popover.querySelector('.driver-popover-done-btn');
            const closeBtn = popover.querySelector('.driver-popover-close-btn');

            // Close button always destroys
            bindClick(closeBtn, () => forceDestroy('close-btn'));

            // Done button explicitly destroys
            bindClick(doneBtn, () => forceDestroy('done-btn'));

            // Next acts as Done on last step
            if (nextBtn) {
              bindClick(nextBtn, () => {
                const current = document.querySelector('.driver-popover');
                const total = Number(current?.getAttribute('data-total-steps') || steps.length);
                const curr = Number(current?.getAttribute('data-current-step') || (options?.state?.activeIndex ?? 0) + 1);
                if (curr >= total) forceDestroy('next-on-last');
              });
            }
          }
        },
        steps,
        onDestroyStarted: () => {
          finalizedRef.current = true;
          // Clean document listeners
          if (teardownRef.current.esc) {
            try { document.removeEventListener('keydown', teardownRef.current.esc); } catch {}
            teardownRef.current.esc = null;
          }
          if (teardownRef.current.overlay) {
            try { document.querySelector('.driver-overlay')?.removeEventListener('click', teardownRef.current.overlay); } catch {}
            teardownRef.current.overlay = null;
          }
          teardownRef.current.bound = new WeakSet();

          // Mark completed for auto-tour; schedule to avoid racing unmount
          Promise.resolve().then(() => markCompleted());
        },
      });

      // Document-level capture listener as an additional safety net
      const docClickCapture = (e) => {
        const target = e.target;
        if (!target) return;
        const inPopover = target.closest?.('.driver-popover');
        if (!inPopover) return;

        const isClose = target.closest('.driver-popover-close-btn');
        const isDone = target.closest('.driver-popover-done-btn');
        const isNext = target.closest('.driver-popover-next-btn');

        if (isClose || isDone) {
          forceDestroy(isClose ? 'doc-close' : 'doc-done');
          return;
        }
        if (isNext) {
          const pop = document.querySelector('.driver-popover');
          const total = Number(pop?.getAttribute('data-total-steps') || steps.length);
          const curr = Number(pop?.getAttribute('data-current-step') || 1);
          if (curr >= total) forceDestroy('doc-next-on-last');
        }
      };
      document.addEventListener('click', docClickCapture, true);
      teardownRef.current.doc = docClickCapture;

      // ESC to close
      const onEsc = (e) => {
        if (e.key === 'Escape') {
          try { driverRef.current?.destroy(); } catch {}
        }
      };
      document.addEventListener('keydown', onEsc);
      teardownRef.current.esc = onEsc;

      // Overlay click: enabled only on last step
      const overlayHandler = (e) => {
        const pop = document.querySelector('.driver-popover');
        const total = Number(pop?.getAttribute('data-total-steps') || steps.length);
        const curr = Number(pop?.getAttribute('data-current-step') || 1);
        if (curr >= total) forceDestroy('overlay-last');
      };
      // Bind lazily after driver draws overlay
      setTimeout(() => {
        const overlay = document.querySelector('.driver-overlay');
        if (overlay) {
          overlay.addEventListener('click', overlayHandler, { passive: true });
          teardownRef.current.overlay = overlayHandler;
        }
      }, 0);

      // Start the multi-step tour
      driverRef.current.drive();
    }, 500);

    return () => {
      clearTimeout(timer);
      if (driverRef.current) {
        try { driverRef.current.destroy(); } catch { /* noop */ }
      }
      if (teardownRef.current.esc) {
        try { document.removeEventListener('keydown', teardownRef.current.esc); } catch {}
        teardownRef.current.esc = null;
      }
      if (teardownRef.current.overlay) {
        try { document.querySelector('.driver-overlay')?.removeEventListener('click', teardownRef.current.overlay); } catch {}
        teardownRef.current.overlay = null;
      }
          if (teardownRef.current.doc) {
            try { document.removeEventListener('click', teardownRef.current.doc, true); } catch {}
            teardownRef.current.doc = null;
          }
      if (teardownRef.current.doc) {
        try { document.removeEventListener('click', teardownRef.current.doc, true); } catch {}
        teardownRef.current.doc = null;
      }
      teardownRef.current.bound = new WeakSet();
      finalizedRef.current = false;
    };
  }, [loading, completed, steps, markCompleted]);

  return null;
}
