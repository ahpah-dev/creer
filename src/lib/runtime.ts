import { useEffect } from 'react'
import { engine } from '../audio/engine'
import { useProjectStore, saveProjectToStorage } from '../store/project'
import { useSessionStore } from '../store/session'
import { stopRecording } from './recording'

/**
 * The parts of the studio that are not tied to a screen layout: keeping the
 * audio engine pointed at the project, transport callbacks, autosave and the
 * save-on-hide safety net. The desktop and mobile shells both run this.
 */
export function useStudioRuntime() {
  const project = useProjectStore((state) => state.project)
  const setSaveStatus = useSessionStore((state) => state.setSaveStatus)

  // Keep the audio engine pointed at the latest project.
  useEffect(() => {
    engine.attach(project)
    document.title = `${project.name} — Creer`
  }, [project])

  // Transport callbacks + first-run audio warmup.
  useEffect(() => {
    engine.onEnd = () => {
      const session = useSessionStore.getState()
      session.setPlaying(false)
      session.setPausedBeat(engine.getPosition())
      if (session.isRecording) {
        stopRecording()
      }
    }
    engine.setMetronome(useSessionStore.getState().metronome)
    const warm = () => {
      void engine.ensureContext()
    }
    window.addEventListener('pointerdown', warm, { once: true })
    return () => {
      engine.onEnd = null
      window.removeEventListener('pointerdown', warm)
    }
  }, [])

  // Debounced local autosave.
  useEffect(() => {
    let timer = 0
    const save = (state = useProjectStore.getState()) => {
      const ok = saveProjectToStorage(state.project)
      setSaveStatus(ok ? 'saved' : 'error')
    }
    timer = window.setTimeout(() => save(), 500)
    const unsubscribe = useProjectStore.subscribe((state, previous) => {
      if (state.project === previous.project) return
      setSaveStatus('saving')
      window.clearTimeout(timer)
      timer = window.setTimeout(() => save(state), 420)
    })
    return () => {
      window.clearTimeout(timer)
      unsubscribe()
    }
  }, [setSaveStatus])

  // Flush the project when the page is hidden (tab switch, app switch, lock screen).
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === 'hidden') {
        saveProjectToStorage(useProjectStore.getState().project)
      }
    }
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('pagehide', flush)
    }
  }, [])
}
