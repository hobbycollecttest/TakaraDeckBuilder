import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { inject } from '@vercel/analytics'
import HQPlay from './HQPlay'
import '../../styles.css'
import '../play.css'
import './hq.css'

// Vercel Web Analytics: counts page views (no cookies).
inject()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HQPlay />
  </StrictMode>,
)
