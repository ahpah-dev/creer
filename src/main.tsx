import '@fontsource-variable/instrument-sans'
import '@fontsource/instrument-serif/400.css'
import '@fontsource/instrument-serif/400-italic.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import './styles.css'
import './studio.css'
import './mobile/mobile.css'
import { createRoot } from 'react-dom/client'
import Root from './Root'
import { exposeDebugApi } from './lib/debug'

if (
  import.meta.env.DEV ||
  location.protocol === 'file:' ||
  location.hostname === '127.0.0.1' ||
  location.hostname === 'localhost'
) {
  exposeDebugApi()
}
createRoot(document.getElementById('root')!).render(<Root />)
