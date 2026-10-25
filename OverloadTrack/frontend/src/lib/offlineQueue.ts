import api from '../api';
import { isNetworkError, setSyncState } from './connectivity';

/**
 * Ends of sessions recorded without network ("Terminer" in a gym with no signal), kept on the device
 * and sent once the server answers. Each one is keyed by its session id, so sending it twice
 * (answer lost on the way back) finishes the same session again instead of creating a second one.
 */
export interface FinishPayload {
  sessionId: string;
  rpe: number;
  notes: string;
  exercises: unknown[];
  /** The real end of the session, kept as is however late it reaches the server. */
  endedAt: string;
  /** How to create the session if the server doesn't have it (started offline, or lost meanwhile). */
  offline: { startedAt: string; title?: string; routineId?: string };
}

interface QueuedFinish {
  payload: FinishPayload;
  queuedAt: string;
}

const STORAGE_PREFIX = 'overloady.pendingFinish.';

/** Session ids the app makes up offline; the server keeps them as the session's own id. */
export const newOfflineSessionId = () =>
  `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const isOfflineSessionId = (id: string | null | undefined) => !!id && id.startsWith('local-');

const read = (userId: string): QueuedFinish[] => {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_PREFIX + userId) || '[]');
    return Array.isArray(list) ? list.filter((item) => item?.payload?.sessionId) : [];
  } catch {
    return [];
  }
};

const write = (userId: string, list: QueuedFinish[]) => {
  try {
    if (list.length > 0) localStorage.setItem(STORAGE_PREFIX + userId, JSON.stringify(list));
    else localStorage.removeItem(STORAGE_PREFIX + userId);
  } catch {
    // Storage full or blocked: nothing more can be kept on this device.
  }
  setSyncState({ pending: list.length });
};

/** Sessions of this athlete waiting on the device, oldest first. */
export const pendingFinishes = (userId: string | null) => (userId ? read(userId) : []);

export const refreshPendingCount = (userId: string | null) => setSyncState({ pending: pendingFinishes(userId).length });

/** Kept until the server has it; the same session queued again replaces its earlier end. */
export const queueFinish = (userId: string, payload: FinishPayload) => {
  const list = read(userId).filter((item) => item.payload.sessionId !== payload.sessionId);
  list.push({ payload, queuedAt: new Date().toISOString() });
  write(userId, list);
};

const replace = (userId: string, sessionId: string, payload: FinishPayload) =>
  write(
    userId,
    read(userId).map((item) => (item.payload.sessionId === sessionId ? { ...item, payload } : item)),
  );

const remove = (userId: string, sessionId: string) =>
  write(
    userId,
    read(userId).filter((item) => item.payload.sessionId !== sessionId),
  );

let flushing: Promise<number> | null = null;

/**
 * Sends the queued ends one by one, oldest first. Stops at the first network failure (still
 * offline) and keeps everything the server has not confirmed. Resolves with the number sent.
 */
export const flushPendingFinishes = (userId: string | null): Promise<number> => {
  if (!userId) return Promise.resolve(0);
  flushing ??= (async () => {
    let sent = 0;
    const queue = read(userId);
    if (queue.length === 0) return 0;
    setSyncState({ syncing: true });
    try {
      for (const { payload } of queue) {
        try {
          await api.post('/workout/finish', payload, { timeout: 20_000 });
          remove(userId, payload.sessionId);
          sent++;
        } catch (err: any) {
          if (isNetworkError(err)) {
            setSyncState({ online: false });
            break;
          }
          const status = err.response?.status;
          // The server lost the session it started (deleted meanwhile): saved as a new one instead
          if (status === 404 && !isOfflineSessionId(payload.sessionId)) {
            const rescued: FinishPayload = { ...payload, sessionId: newOfflineSessionId() };
            // Kept under its new id first, so a crash right now cannot send it twice
            replace(userId, payload.sessionId, rescued);
            try {
              await api.post('/workout/finish', rescued, { timeout: 20_000 });
              remove(userId, rescued.sessionId);
              sent++;
            } catch {
              break;
            }
            continue;
          }
          // Expired login: nothing goes through until the athlete logs in again
          if (status === 401) break;
          // Refused or server error: kept for a later try, the next sessions still go out
          continue;
        }
      }
      if (sent > 0) setSyncState({ online: true, syncedAt: Date.now() });
      return sent;
    } finally {
      setSyncState({ syncing: false });
      flushing = null;
    }
  })();
  return flushing;
};
