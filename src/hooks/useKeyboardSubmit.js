import { useCallback, useRef } from 'react';
import { toast } from 'sonner';

const KEYBOARD_SAVE_TIP = 'טיפ: יש ללחוץ על Ctrl + Enter לשמירה, או Tab למעבר בין שדות.';

export function useKeyboardSubmit({ onSave, isEnabled = true } = {}) {
  const toastIdRef = useRef('keyboard-submit-tip');

  return useCallback(
    (event) => {
      if (!isEnabled) {
        return;
      }

      if (event.key !== 'Enter') {
        return;
      }

      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        event.stopPropagation();
        onSave?.();
        return;
      }

      if (event.altKey || event.shiftKey) {
        return;
      }

      event.preventDefault();
      toast.info(KEYBOARD_SAVE_TIP, { id: toastIdRef.current });
    },
    [isEnabled, onSave],
  );
}

export default useKeyboardSubmit;
