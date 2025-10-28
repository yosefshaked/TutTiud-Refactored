import React, { useState, useEffect } from 'react';
import Joyride, { STATUS } from 'react-joyride';
import { useUserRole } from '../hooks/useUserRole.js';
import { useOnboardingStatus } from '../hooks/useOnboardingStatus.js';
import { getTourSteps } from './TourSteps.jsx';
import { tourConfig } from '../utils/tourConfig.js';

/**
 * WelcomeTour - Interactive onboarding tour for new users
 * Automatically shows on first login, adapts to user role
 */
export function WelcomeTour() {
  const { isAdmin } = useUserRole();
  const { completed, loading, markCompleted } = useOnboardingStatus();
  const [run, setRun] = useState(false);

  // Start tour when user is loaded and hasn't completed it
  useEffect(() => {
    if (!loading && !completed) {
      // Small delay to ensure UI is rendered
      const timer = setTimeout(() => {
        setRun(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [loading, completed]);

  const handleJoyrideCallback = (data) => {
    const { status, action } = data;
    const finishedStatuses = [STATUS.FINISHED, STATUS.SKIPPED];

    if (finishedStatuses.includes(status)) {
      setRun(false);

      // Mark as completed if tour finished (not skipped)
      if (status === STATUS.FINISHED) {
        markCompleted();
      } else if (status === STATUS.SKIPPED && action === 'skip') {
        // User explicitly skipped, still mark as completed
        markCompleted();
      }
    }
  };

  // Don't render if loading or already completed
  if (loading || completed) {
    return null;
  }

  const steps = getTourSteps(isAdmin);

  return (
    <Joyride
      steps={steps}
      run={run}
      callback={handleJoyrideCallback}
      {...tourConfig}
    />
  );
}
