import React, { useEffect, useMemo, useRef } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
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
      driverRef.current = driver({
        showProgress: true,
        allowClose: true,
        overlayOpacity: 0.5,
        nextBtnText: 'הבא',
        prevBtnText: 'הקודם',
        doneBtnText: 'סיום',
        closeBtnAriaLabel: 'דלג',
        animate: true,
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
