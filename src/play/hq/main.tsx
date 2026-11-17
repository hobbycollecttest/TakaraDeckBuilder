import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import HQPlay from './HQPlay'
import '../../styles.css'
import '../play.css'
import './hq.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HQPlay />
  </StrictMode>,
)
