import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyHighContrast, readHighContrast } from './lib/contrast'

// Before the first paint, so a bright-gym setting never flashes the regular theme
applyHighContrast(readHighContrast())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
