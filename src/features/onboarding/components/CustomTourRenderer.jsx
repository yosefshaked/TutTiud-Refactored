import React from 'react';
import { createPortal } from 'react-dom';
import { subscribe, getState, nextStep, prevStep, closeTour } from '../customTour.js';

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
    // Simple placement: prefer top, else bottom
    const pop = popRef.current;
    const viewportH = window.innerHeight;
    const preferTop = rect.top > viewportH / 2;
    const placement = preferTop ? 'top' : 'bottom';
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

  const Popover = (
    <div
      ref={popRef}
      className="tt-tour-popover"
      role="dialog"
      aria-modal="true"
      dir="rtl"
      style={{
        position: 'fixed',
        zIndex: 10001,
        top: r ? (layout.placement === 'top' ? Math.max(12, r.top - 140) : Math.min(window.innerHeight - 160, r.bottom + 12)) : '50%',
        left: r ? Math.min(window.innerWidth - 12, Math.max(12, r.left + r.width / 2)) : '50%',
        transform: r ? 'translateX(-50%)' : 'translate(-50%, -50%)',
      }}
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
