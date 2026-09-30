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

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
