import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, Check, Loader2 } from 'lucide-react';
import { useOnboardingStatus } from '../hooks/useOnboardingStatus.js';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import '../styles/tour.css';
import { getTourSteps } from './TourSteps.jsx';
import { useUserRole } from '../hooks/useUserRole.js';

/**
 * OnboardingCard - Settings card to manually activate the welcome tour
 * Available to both admins and members
 */
export function OnboardingCard() {
  const { completed, reset } = useOnboardingStatus();
  const { isAdmin } = useUserRole();
  const [isStarting, setIsStarting] = useState(false);
  const teardownRef = React.useRef({ esc: null, overlay: null, doc: null, bound: new WeakSet() });
  const finalizedRef = React.useRef(false);

  const handleStartTour = async () => {
    setIsStarting(true);
    
    // Reset the completion status
    await reset();
    
    // Small delay to ensure UI updates
    setTimeout(() => {
  const steps = getTourSteps(isAdmin);

  const driverInstance = driver({
        showProgress: true,
        progressText: '{{current}} מתוך {{total}}',
        allowClose: true,
        nextBtnText: 'הבא',
        prevBtnText: 'הקודם',
        doneBtnText: 'סיום',
        closeBtnAriaLabel: 'סגור',
        animate: true,
        smoothScroll: true,
        popoverClass: 'driverjs-theme',
        onHighlightStarted: (element, step, options) => {
          // Add data attributes for progress gauge
          const popover = document.querySelector('.driver-popover');
          if (popover && options.state) {
            popover.setAttribute('data-current-step', options.state.activeIndex + 1);
            popover.setAttribute('data-total-steps', steps.length);
            // Defensive bindings: close/done/next(last)
            const bindClick = (el, fn) => {
              if (!el) return;
              const bound = teardownRef.current.bound;
              if (bound.has(el)) return;
              // capture phase to bypass any stopImmediatePropagation by the lib
              el.addEventListener('click', fn, { capture: true });
              bound.add(el);
            };

            const forceDestroy = (reason) => {
              // Defer to avoid racing internal driver handlers
              setTimeout(() => {
                if (finalizedRef.current) return;
                try {
                  if (window.__TT_TOUR_DEBUG__) console.info('[tour:manual] forceDestroy:', reason);
                  driverInstance?.destroy();
                } catch {}
                // Fallback hard removal if DOM still present
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

            const nextBtn = popover.querySelector('.driver-popover-next-btn');
            const doneBtn = popover.querySelector('.driver-popover-done-btn');
            const closeBtn = popover.querySelector('.driver-popover-close-btn');

            bindClick(closeBtn, () => forceDestroy('close-btn'));
            bindClick(doneBtn, () => forceDestroy('done-btn'));
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
          setIsStarting(false);
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
          teardownRef.current.bound = new WeakSet();
        },
      });

      // Document-level capture listener for Close/Done/Next(last)
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
          try { driverInstance?.destroy(); } catch {}
        }
      };
      document.addEventListener('keydown', onEsc);
      teardownRef.current.esc = onEsc;

      // Overlay click to close on last step only
      const overlayHandler = () => {
        const pop = document.querySelector('.driver-popover');
        const total = Number(pop?.getAttribute('data-total-steps') || steps.length);
        const curr = Number(pop?.getAttribute('data-current-step') || 1);
        if (curr >= total) forceDestroy('overlay-last');
      };
      setTimeout(() => {
        const overlay = document.querySelector('.driver-overlay');
        if (overlay) {
          overlay.addEventListener('click', overlayHandler, { passive: true });
          teardownRef.current.overlay = overlayHandler;
        }
      }, 0);

      driverInstance.drive();
    }, 300);
  };

  return (
    <Card className="group relative w-full overflow-hidden border-0 shadow-md transition-all duration-200 bg-white/80 hover:shadow-xl hover:scale-[1.02]">
      <CardHeader className="space-y-2 pb-3 flex-1">
        <div className="flex items-start gap-2">
          <div className="rounded-lg p-2 transition-colors bg-purple-100 text-purple-600 group-hover:bg-purple-600 group-hover:text-white">
            <Play className="h-5 w-5" aria-hidden="true" />
          </div>
          <CardTitle className="text-lg font-bold text-slate-900">
            סיור מודרך במערכת
          </CardTitle>
        </div>
        <p className="text-sm leading-relaxed min-h-[2.5rem] text-slate-600">
          {completed 
            ? 'השלמת את הסיור המודרך. ניתן להפעיל שוב בכל עת' 
            : 'הסיור המודרך יעזור לך להכיר את התכונות העיקריות של המערכת'
          }
        </p>
        {completed && (
          <div className="flex items-center gap-2 text-sm text-green-600">
            <Check className="h-4 w-4" />
            <span>הושלם</span>
          </div>
        )}
      </CardHeader>
      <CardContent className="pt-0 mt-auto">
        <Button 
          size="sm" 
          className="w-full gap-2" 
          onClick={handleStartTour}
          disabled={isStarting}
          variant="default"
        >
          {isStarting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> מפעיל...
            </>
          ) : (
            <>
              <Play className="h-4 w-4" /> 
              {completed ? 'הפעל שוב' : 'התחל סיור'}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
