import { useSyncExternalStore } from 'react';

// Network state as the app lives it: navigator.onLine says "connected to a Wi-Fi", not "the
// server answers", so a request that fails without any answer also counts as offline, until the
// next one that gets through.

export interface SyncState {
  online: boolean;
  /** Finished sessions kept on the device, waiting to reach the server. */
  pending: number;
  syncing: boolean;
  /** Time of the last successful sync of queued sessions, to say so briefly. */
  syncedAt: number | null;
}

let state: SyncState = {
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  pending: 0,
  syncing: false,
  syncedAt: null,
};
const listeners = new Set<() => void>();

export const getSyncState = () => state;

export const setSyncState = (patch: Partial<SyncState>) => {
  const next = { ...state, ...patch };
  if ((Object.keys(patch) as (keyof SyncState)[]).every((key) => next[key] === state[key])) return;
  state = next;
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useSyncState = () => useSyncExternalStore(subscribe, getSyncState, getSyncState);

/** No answer at all (offline, server unreachable, timeout): not an error the server returned. */
export const isNetworkError = (err: any) => !!err && !err.response && err.code !== 'ERR_CANCELED';

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => setSyncState({ online: true }));
  window.addEventListener('offline', () => setSyncState({ online: false }));
}
