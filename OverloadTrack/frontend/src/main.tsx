import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyHighContrast, readHighContrast } from './lib/contrast'

// Before the first paint, so a bright-gym setting never flashes the regular theme
applyHighContrast(readHighContrast())

// The installed app opens without network: the service worker keeps it on the device (production
// builds only, the dev server serves fresh modules)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
