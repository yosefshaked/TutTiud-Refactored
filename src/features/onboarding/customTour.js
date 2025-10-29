// Simple singleton tour bus to control a custom React-based tour overlay
// State shape: { isOpen, stepIndex, steps, onClose }

const listeners = new Set();

const state = {
  isOpen: false,
  stepIndex: 0,
  steps: [],
  onClose: null,
};

function notify() {
  for (const fn of listeners) {
    try { fn({ ...state }); } catch {}
  }
}

export function subscribe(listener) {
  listeners.add(listener);
  // send current state immediately
  try { listener({ ...state }); } catch {}
  return () => listeners.delete(listener);
}

export function openTour(steps, { onClose } = {}) {
  state.steps = Array.isArray(steps) ? steps : [];
  state.stepIndex = 0;
  state.onClose = typeof onClose === 'function' ? onClose : null;
  state.isOpen = state.steps.length > 0;
  notify();
}

export function closeTour(reason = 'close') {
  if (!state.isOpen) return;
  state.isOpen = false;
  notify();
  const cb = state.onClose;
  state.onClose = null;
  if (cb) {
    try { cb({ reason }); } catch {}
  }
}

export function nextStep() {
  if (!state.isOpen) return;
  if (state.stepIndex < state.steps.length - 1) {
    state.stepIndex += 1;
    notify();
  } else {
    closeTour('done');
  }
}

export function prevStep() {
  if (!state.isOpen) return;
  if (state.stepIndex > 0) {
    state.stepIndex -= 1;
    notify();
  }
}

export function getState() {
  return { ...state };
}
