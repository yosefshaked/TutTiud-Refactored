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

            // Safety: ensure the Done button closes the tour when on the last step.
            // Some environments may block the driver's default done handler; attach
            // a click listener that forces destroy when activeIndex is last.
            const nextBtn = popover.querySelector('.driver-popover-next-btn');
            if (nextBtn) {
              // Remove any previously attached handler we set (avoid duplicates)
              nextBtn._tuttiud_onclick = nextBtn._tuttiud_onclick || null;
              if (nextBtn._tuttiud_onclick) {
                try { nextBtn.removeEventListener('click', nextBtn._tuttiud_onclick); } catch {}
                nextBtn._tuttiud_onclick = null;
              }

              const handler = () => {
                try {
                  if (options?.state && options.state.activeIndex === steps.length - 1) {
                    if (driverRef.current) {
                      try { driverRef.current.destroy(); } catch { /* noop */ }
                    }
                  }
                } catch (err) {
                  // swallow - this is a non-critical safety handler
                }
              };

              nextBtn._tuttiud_onclick = handler;
              nextBtn.addEventListener('click', handler);
            }
          }
        },
        steps,
        onDestroyStarted: () => {
          // Mark completed regardless of skip/finish to avoid nagging users
          markCompleted();
        },
      });

      // Start the multi-step tour
      driverRef.current.drive();
    }, 500);

    return () => {
      clearTimeout(timer);
      if (driverRef.current) {
        try { driverRef.current.destroy(); } catch { /* noop */ }
      }
    };
  }, [loading, completed, steps, markCompleted]);

  return null;
}
