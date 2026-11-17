import { useCallback, useEffect, useRef, useState } from 'react';

const CONFIRM_WINDOW_MS = 4000;

/**
 * Two-step guard for bulk actions. With 2+ remaining items, the first press
 * arms (for 4 s); a second press runs the action. With 0-1, it runs at once.
 * Arming is tied to the remaining count: if it changes, the guard disarms.
 */
export function useConfirmBulk(remaining: number, action: () => void) {
  const [armedFor, setArmedFor] = useState<number | null>(null);
  const [seen, setSeen] = useState(remaining);
  const timer = useRef<number | null>(null);
  // Any change of the remaining count disarms for good (adjust state during
  // render, so a count coming back to a previous value cannot re-arm).
  if (seen !== remaining) {
    setSeen(remaining);
    setArmedFor(null);
  }
  const armed = armedFor !== null && armedFor === remaining && seen === remaining;

  const clear = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  // Drop a pending timer when the count changes (the armed state is already
  // void by derivation) and on unmount.
  useEffect(() => clear, [remaining, clear]);

  const press = useCallback(() => {
    clear();
    if (remaining < 2 || armed) {
      setArmedFor(null);
      action();
      return;
    }
    setArmedFor(remaining);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setArmedFor(null);
    }, CONFIRM_WINDOW_MS);
  }, [remaining, armed, action, clear]);

  return { armed, press };
}
