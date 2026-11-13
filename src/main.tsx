import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// Each game's card list is loaded only when that game is opened.
const load = location.pathname.startsWith('/haikyu') ? import('./games/haikyu') : import('./games/horobeat')
load.then(({ default: game }) => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App game={game} />
    </StrictMode>,
  )
})
