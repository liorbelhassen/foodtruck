import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import PodtrackDebtScreen from './components/PodtrackDebtScreen.jsx'

// #/podtrack-debt: public, login-free page reachable by direct link only (never linked in the UI).
// App is imported dynamically so this page never loads Firebase / anonymous auth / visit logging.
const isDebtPage = () => window.location.hash.replace(/\/$/, '') === '#/podtrack-debt'
const onDebtPage = isDebtPage()
const root = createRoot(document.getElementById('root'))

if (onDebtPage) {
  root.render(
    <StrictMode>
      <PodtrackDebtScreen />
    </StrictMode>,
  )
} else {
  import('./App.jsx').then((mod) => {
    const App = mod.default
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
}

window.addEventListener('hashchange', () => { if (isDebtPage() !== onDebtPage) window.location.reload() })
