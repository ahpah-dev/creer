import '@fontsource-variable/instrument-sans'
import '@fontsource/instrument-serif/400.css'
import '@fontsource/instrument-serif/400-italic.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'

document.documentElement.classList.add('js')

// Frosted nav once the page has scrolled.
const nav = document.getElementById('nav')
const syncNav = () => nav?.classList.toggle('is-scrolled', window.scrollY > 8)
syncNav()
window.addEventListener('scroll', syncNav, { passive: true })

// Gentle reveal-on-scroll; everything is visible straight away without IntersectionObserver.
const items = Array.from(document.querySelectorAll<HTMLElement>('.reveal'))
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.classList.add('is-visible')
        observer.unobserve(entry.target)
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
  )
  items.forEach((item, index) => {
    // Stagger siblings that enter together (hero copy, cards, steps).
    item.style.setProperty('--delay', `${(index % 3) * 70}ms`)
    observer.observe(item)
  })
} else {
  items.forEach((item) => item.classList.add('is-visible'))
}
