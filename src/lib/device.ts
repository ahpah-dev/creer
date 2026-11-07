import { useEffect, useState } from 'react'

export type UiPreference = 'auto' | 'mobile' | 'desktop'

const STORAGE_KEY = 'creer.ui'
const listeners = new Set<() => void>()

/** True for phones (and phone-sized touch screens). Tablets and desktops get the full studio. */
export const looksLikePhone = () => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } }
  if (nav.userAgentData?.mobile === true) return true
  const ua = nav.userAgent || ''
  if (/iPhone|iPod|Windows Phone|Android.+Mobile|Mobile Safari|Opera Mini|IEMobile|BlackBerry/i.test(ua)) return true
  // Small touch screens that do not announce themselves as phones (foldables, odd browsers).
  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
  const shortSide = Math.min(window.innerWidth, window.innerHeight)
  return coarse && shortSide <= 600
}

const readQueryOverride = (): UiPreference | null => {
  try {
    const params = new URLSearchParams(window.location.search)
    const ui = params.get('ui')
    if (ui === 'mobile' || ui === 'desktop' || ui === 'auto') return ui
    if (params.has('mobile')) return 'mobile'
    if (params.has('desktop')) return 'desktop'
  } catch {
    /* noop */
  }
  return null
}

export const getUiPreference = (): UiPreference => {
  const query = readQueryOverride()
  if (query) return query
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'mobile' || stored === 'desktop') return stored
  } catch {
    /* storage can be unavailable */
  }
  return 'auto'
}

export const setUiPreference = (preference: UiPreference) => {
  try {
    if (preference === 'auto') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, preference)
  } catch {
    /* storage can be unavailable */
  }
  // A query-string override would otherwise win over the choice that was just made.
  try {
    const url = new URL(window.location.href)
    if (url.searchParams.has('ui') || url.searchParams.has('mobile') || url.searchParams.has('desktop')) {
      url.searchParams.delete('ui')
      url.searchParams.delete('mobile')
      url.searchParams.delete('desktop')
      window.history.replaceState(null, '', url.toString())
    }
  } catch {
    /* noop */
  }
  listeners.forEach((listener) => listener())
}

export const resolveUseMobile = () => {
  const preference = getUiPreference()
  if (preference === 'mobile') return true
  if (preference === 'desktop') return false
  return looksLikePhone()
}

/** Re-evaluates when the window is resized, rotated or the preference changes. */
export function useIsMobile() {
  const [mobile, setMobile] = useState(resolveUseMobile)
  useEffect(() => {
    const update = () => setMobile(resolveUseMobile())
    listeners.add(update)
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      listeners.delete(update)
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])
  return mobile
}
