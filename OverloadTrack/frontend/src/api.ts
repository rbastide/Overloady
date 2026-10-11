import axios from 'axios';

// Prioritize environment variable (e.g. from Vercel / Render deployment)
// Fall back to current hostname on port 3000 for local network / dev
const envUrl = (import.meta as any).env?.VITE_API_URL;

const backendHost =
  typeof window !== 'undefined' && window.location.hostname
    ? window.location.hostname
    : 'localhost';

const baseURL = envUrl || `http://${backendHost}:3000`;

const api = axios.create({
  baseURL,
});

/**
 * The login lives in sessionStorage: it survives a reload of the tab, but every new visit
 * (new tab, browser or app reopened) starts on the login page.
 */
const TOKEN_KEY = 'token';

// Logins kept by older versions in localStorage would skip the login page: dropped once.
try {
  localStorage.removeItem(TOKEN_KEY);
} catch {
  // Storage unavailable: nothing was kept there either.
}

export const getToken = (): string | null => {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setToken = (token: string) => {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Storage unavailable (private mode): the login only lasts until the next reload.
  }
};

export const clearToken = () => {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing to clear.
  }
};

/** A stored token only counts if it is a JWT that has not expired yet. */
export const hasValidToken = () => {
  const token = getToken();
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    const isValid = !payload.exp || payload.exp * 1000 > Date.now();
    if (!isValid) clearToken();
    return isValid;
  } catch {
    clearToken();
    return false;
  }
};

/**
 * Fire-and-forget wake-up of the backend (Render free tier) and of the database (Neon scale-to-zero),
 * sent as soon as the login screen shows so both are ready by the time the form is submitted.
 */
export const warmUpBackend = () => {
  api.get('/health', { params: { db: 1 }, timeout: 90_000 }).catch(() => {});
};

// The app registers what to do when the API rejects the session (back to the login page).
let unauthorizedHandler: (() => void) | null = null;
export const onUnauthorized = (handler: () => void) => {
  unauthorizedHandler = handler;
};

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // A 401 on an authenticated call means the session is gone; a failed login keeps its own message.
    if (error.response?.status === 401 && error.config?.headers?.Authorization) {
      clearToken();
      unauthorizedHandler?.();
    }
    return Promise.reject(error);
  },
);

export default api;
