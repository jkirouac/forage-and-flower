import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fonts are bundled so they work offline in the garden and no font service is called.
import '@fontsource-variable/newsreader/opsz.css'
import '@fontsource-variable/newsreader/opsz-italic.css'
import '@fontsource-variable/public-sans/wght.css'
import './styles.css'
import App from './App.tsx'
import { listenForInstall } from './lib/install'
import { followPhoneTheme } from './lib/theme'

// Chrome's install prompt fires early, so listen before the app draws.
listenForInstall()
followPhoneTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
