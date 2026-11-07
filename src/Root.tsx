import App from './App'
import MobileApp from './mobile/MobileApp'
import { setUiPreference, useIsMobile, looksLikePhone, getUiPreference } from './lib/device'

/**
 * Chooses the shell: phones get Creer Mobile, everything else gets the full
 * studio. `?mobile` / `?desktop` (or the switch inside the app) override it.
 */
export default function Root() {
  const mobile = useIsMobile()
  if (mobile) return <MobileApp />
  const stuckOnPhone = getUiPreference() === 'desktop' && looksLikePhone()
  return (
    <>
      <App />
      {stuckOnPhone && (
        <button className="ui-switch-pill" onClick={() => setUiPreference('auto')}>
          Switch to mobile view
        </button>
      )}
    </>
  )
}
