import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './app/App'
import './styles/index.css'
import 'leaflet/dist/leaflet.css'

/**
 * Application entry point.
 *
 * HashRouter is used deliberately: the production build is hosted as static
 * files (GitHub Pages, a USB stick, any web server) and hash routing needs no
 * server-side rewrite rules, so deep links and refreshes always work.
 */
const container = document.getElementById('root')

if (!container) {
  throw new Error('Root container #root was not found in index.html')
}

createRoot(container).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
