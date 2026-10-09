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

/** A stored token only counts if it is a JWT that has not expired yet. */
export const hasValidToken = () => {
  const token = localStorage.getItem('token');
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    const isValid = !payload.exp || payload.exp * 1000 > Date.now();
    if (!isValid) localStorage.removeItem('token');
    return isValid;
  } catch {
    localStorage.removeItem('token');
    return false;
  }
};

// The app registers what to do when the API rejects the session (back to the login page).
let unauthorizedHandler: (() => void) | null = null;
export const onUnauthorized = (handler: () => void) => {
  unauthorizedHandler = handler;
};

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
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
      localStorage.removeItem('token');
      unauthorizedHandler?.();
    }
    return Promise.reject(error);
  },
);

export default api;
