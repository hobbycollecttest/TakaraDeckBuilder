import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { inject } from '@vercel/analytics'
import Play from './Play'
import '../styles.css'
import './play.css'

// Vercel Web Analytics: counts page views (no cookies).
inject()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Play />
  </StrictMode>,
)
