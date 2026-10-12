// Phone-side comforts for the gym: the screen stays on during a session, a short buzz confirms
// a set and calls the end of the rest. Both are silent no-ops where the browser lacks them
// (iOS Safari has no vibration).
import { useEffect } from 'react';

/** Vibration patterns (ms): a tick for a set, a double tap for a record, a long call for the rest. */
export const HAPTICS = {
  set: 18,
  record: [28, 70, 28],
  restEnd: [220, 110, 220],
} satisfies Record<string, number | number[]>;

export const vibrate = (pattern: number | number[]) => {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Vibration blocked (no user gesture yet, or not supported): nothing to do.
  }
};

/** Keeps the screen awake while `active`, taking the lock back when the app returns to the foreground. */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let stopped = false;

    const request = async () => {
      if (document.visibilityState !== 'visible' || (sentinel && !sentinel.released)) return;
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (stopped) lock.release().catch(() => {});
        else sentinel = lock;
      } catch {
        // Refused (battery saver, permission policy): the screen simply follows its usual timeout.
      }
    };

    // The browser drops the lock whenever the app goes to the background
    const onVisibility = () => {
      if (document.visibilityState === 'visible') request();
    };

    request();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisibility);
      sentinel?.release().catch(() => {});
    };
  }, [active]);
}
