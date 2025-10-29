import React from 'react';
import { createPortal } from 'react-dom';
import { subscribe, getState, nextStep, prevStep, closeTour } from '../customTour.js';
import '../styles/tour.css';

function getElementFromStep(step) {
  if (!step) return null;
  const target = typeof step.element === 'function' ? step.element() : (typeof step.element === 'string' ? document.querySelector(step.element) : step.element);
  if (!target || !(target instanceof Element)) return null;
  const rect = target.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return { el: target, rect };
}

function useRaf(fn, deps) {
  const rafRef = React.useRef(0);
  React.useEffect(() => {
    rafRef.current = requestAnimationFrame(() => fn());
    return () => cancelAnimationFrame(rafRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export default function CustomTourRenderer() {
  const [tour, setTour] = React.useState(getState());
  const [layout, setLayout] = React.useState({ rect: null, placement: 'top' });
  const popRef = React.useRef(null);

  React.useEffect(() => subscribe(setTour), []);

  // Recalculate on step change, resize, scroll
  useRaf(() => {
    if (!tour.isOpen) return;
    const step = tour.steps[tour.stepIndex];
    const res = getElementFromStep(step);
    if (!res) {
      setLayout({ rect: null, placement: 'center' });
      return;
    }
    const { rect } = res;
    const viewportH = window.innerHeight;
    const viewportW = window.innerWidth;
    
    // Calculate available space and choose best placement
    const spaceTop = rect.top;
    const spaceBottom = viewportH - rect.bottom;
    const spaceLeft = rect.left;
    const spaceRight = viewportW - rect.right;
    
    // Prefer placement with most space
    let placement = 'bottom';
    if (spaceTop > spaceBottom && spaceTop > 200) {
      placement = 'top';
    } else if (spaceBottom > 200) {
      placement = 'bottom';
    } else if (spaceRight > 400) {
      placement = 'right';
    } else if (spaceLeft > 400) {
      placement = 'left';
    }
    
    setLayout({ rect, placement });
  }, [tour.isOpen, tour.stepIndex]);

  React.useEffect(() => {
    if (!tour.isOpen) return undefined;
    const onScroll = () => setTour({ ...getState() });
    const onResize = () => setTour({ ...getState() });
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    const onKey = (e) => { if (e.key === 'Escape') closeTour('esc'); };
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('keydown', onKey);
    };
  }, [tour.isOpen]);

  if (!tour.isOpen) return null;

  // Portal root
  const portalRoot = document.body;

  const step = tour.steps[tour.stepIndex] || {};
  const title = step?.popover?.title || '';
  const description = step?.popover?.description || '';
  const total = tour.steps.length;
  const current = tour.stepIndex + 1;

  const r = layout.rect;
  const radius = 12;
  const padding = 8;
  const hole = r
    ? { x: r.left - padding, y: r.top - padding, width: r.width + padding * 2, height: r.height + padding * 2, rx: radius, ry: radius }
    : null;

  const handleOverlayClick = () => {
    // Close on overlay only in the last step
    if (current >= total) closeTour('overlay');
  };

  // Calculate popover position based on placement
  let popoverStyle = {
    position: 'fixed',
    zIndex: 10001,
  };

  if (!r) {
    // Center when no target
    popoverStyle.top = '50%';
    popoverStyle.left = '50%';
    popoverStyle.transform = 'translate(-50%, -50%)';
  } else {
    const margin = 16;
    const isMobile = window.innerWidth < 640;
    
    // Use actual popover dimensions if available, otherwise estimate
    const popoverWidth = isMobile ? Math.min(window.innerWidth - 24, 420) : 420;
    const popoverHeight = 280;

    if (isMobile) {
      // On mobile, always position at bottom of screen for better UX
      popoverStyle.bottom = '20px';
      popoverStyle.left = '12px';
      popoverStyle.right = '12px';
      popoverStyle.transform = 'none';
      popoverStyle.maxWidth = 'calc(100vw - 24px)';
    } else {
      switch (layout.placement) {
        case 'top':
          popoverStyle.top = `${Math.max(margin, r.top - popoverHeight - margin)}px`;
          popoverStyle.left = `${Math.min(window.innerWidth - popoverWidth - margin, Math.max(margin, r.left + r.width / 2))}px`;
          popoverStyle.transform = 'translateX(-50%)';
          break;
        case 'bottom':
          popoverStyle.top = `${Math.min(window.innerHeight - popoverHeight - margin, r.bottom + margin)}px`;
          popoverStyle.left = `${Math.min(window.innerWidth - popoverWidth - margin, Math.max(margin, r.left + r.width / 2))}px`;
          popoverStyle.transform = 'translateX(-50%)';
          break;
        case 'left':
          popoverStyle.top = `${Math.max(margin, Math.min(window.innerHeight - popoverHeight - margin, r.top + r.height / 2))}px`;
          popoverStyle.left = `${Math.max(margin, r.left - popoverWidth - margin)}px`;
          popoverStyle.transform = 'translateY(-50%)';
          break;
        case 'right':
          popoverStyle.top = `${Math.max(margin, Math.min(window.innerHeight - popoverHeight - margin, r.top + r.height / 2))}px`;
          popoverStyle.left = `${Math.min(window.innerWidth - popoverWidth - margin, r.right + margin)}px`;
          popoverStyle.transform = 'translateY(-50%)';
          break;
        default:
          popoverStyle.top = `${Math.min(window.innerHeight - popoverHeight - margin, r.bottom + margin)}px`;
          popoverStyle.left = `${Math.min(window.innerWidth - popoverWidth - margin, Math.max(margin, r.left + r.width / 2))}px`;
          popoverStyle.transform = 'translateX(-50%)';
      }
    }
  }

  const Popover = (
    <div
      ref={popRef}
      className="tt-tour-popover"
      role="dialog"
      aria-modal="true"
      dir="rtl"
      style={popoverStyle}
    >
      <div className="tt-tour-card">
        <button className="tt-tour-close" aria-label="סגור" onClick={() => closeTour('close')}>×</button>
        <div className="tt-tour-title">{title}</div>
        <div className="tt-tour-desc">{description}</div>
        <div className="tt-tour-footer">
          <div className="tt-tour-progress" aria-hidden="true">
            <div className="tt-tour-progress-fill" style={{ width: `${(current / total) * 100}%` }} />
          </div>
          <div className="tt-tour-actions">
            <button className="tt-tour-btn tt-tour-prev" onClick={prevStep} disabled={current === 1}>הקודם</button>
            {current < total ? (
              <button className="tt-tour-btn tt-tour-next" onClick={nextStep}>הבא</button>
            ) : (
              <button className="tt-tour-btn tt-tour-next" onClick={() => closeTour('done')}>סיום</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const Overlay = (
    <div className="tt-tour-root" style={{ direction: 'rtl' }}>
      <svg className="tt-tour-overlay" width="100%" height="100%">
        <defs>
          <mask id="tt-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {hole && <rect x={hole.x} y={hole.y} width={hole.width} height={hole.height} rx={hole.rx} ry={hole.ry} fill="black" />}
          </mask>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" mask="url(#tt-mask)" fill="rgba(0,0,0,0.6)" onClick={handleOverlayClick} />
      </svg>
    </div>
  );

  return createPortal(
    <>
      {Overlay}
      {Popover}
    </>,
    portalRoot
  );
}
