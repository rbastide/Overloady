import type { ActiveExercise } from '../components/ActiveExercise';
import { getToken } from '../api';

/**
 * The running session, saved on the device at every change: the sets are only sent to the
 * server when the session is finished, so closing the app must not lose them.
 */
export interface SessionDraft {
  userId: string;
  sessionId: string;
  routineName: string | null;
  testStep: number | null;
  workout: ActiveExercise[];
  notes: string;
  rpe: number;
  /** ISO date: the duration keeps counting from the real start. */
  startedAt: string;
  tips: string[];
}

const STORAGE_PREFIX = 'overloady.activeSession.';

/** The signed-in athlete, read from the stored token: a draft only comes back to its owner. */
export const currentUserId = (): string | null => {
  try {
    const token = getToken();
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
};

export const saveSessionDraft = (draft: SessionDraft) => {
  try {
    localStorage.setItem(STORAGE_PREFIX + draft.userId, JSON.stringify(draft));
  } catch {
    // Storage unavailable (private mode, quota): the session simply isn't kept on the device.
  }
};

export const loadSessionDraft = (userId: string): SessionDraft | null => {
  try {
    const draft = JSON.parse(localStorage.getItem(STORAGE_PREFIX + userId) || 'null');
    const isValid =
      draft &&
      draft.userId === userId &&
      typeof draft.sessionId === 'string' &&
      Array.isArray(draft.workout) &&
      !Number.isNaN(Date.parse(draft.startedAt));
    return isValid ? draft : null;
  } catch {
    return null;
  }
};

export const clearSessionDraft = (userId: string | null) => {
  if (!userId) return;
  try {
    localStorage.removeItem(STORAGE_PREFIX + userId);
  } catch {
    // Nothing to clear.
  }
};
