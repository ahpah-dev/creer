import { useEffect } from 'react'
import { engine } from './audio/engine'
import { useProjectStore, getSelectedClip, saveProjectToStorage } from './store/project'
import { useSessionStore } from './store/session'
import { seekTo, toggleLoop, toggleMute, togglePlayback, toggleSolo } from './lib/transport'
import { deleteSelectedClip, duplicateSelectedClip } from './lib/clips'
import { stopRecording, toggleRecording } from './lib/recording'
import {
  copySelectedClips,
  copySelectedNotes,
  cutSelectedClips,
  cutSelectedNotes,
  pasteClipboard,
} from './lib/clipboard'
import { isTypingTarget } from './lib/utils'
import { TopBar } from './components/TopBar'
import { Toolbar } from './components/Toolbar'
import { Arrangement } from './components/Arrangement'
import { EditorDock } from './components/EditorDock'
import { StatusBar } from './components/StatusBar'
import { ModalRoot, ToastStack } from './components/Modals'

export default function App() {
  const project = useProjectStore((state) => state.project)
  const setSaveStatus = useSessionStore((state) => state.setSaveStatus)
  const isPlaying = useSessionStore((state) => state.isPlaying)
  const toast = useSessionStore((state) => state.toast)

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

  // A quiet welcome that only appears once per browser.
  useEffect(() => {
    try {
      if (localStorage.getItem('creer.welcomed')) return
    } catch {
      /* storage can be unavailable */
    }
    const timer = window.setTimeout(() => {
      toast('Welcome to Creer', 'Press Space to play the demo, or double-click a lane to start your own.', 'default')
      try {
        localStorage.setItem('creer.welcomed', '1')
      } catch {
        /* storage can be unavailable */
      }
    }, 1400)
    return () => window.clearTimeout(timer)
  }, [toast])

  // Global shortcuts. Musical typing owns the letter keys when Sounds & Keys is open.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return
      const session = useSessionStore.getState()
      const projectStore = useProjectStore.getState()
      if (session.modal) return
      const mod = event.metaKey || event.ctrlKey
      const key = event.key
      const lower = key.toLowerCase()
      const musicalTyping = session.dock === 'keys'

      if (key === ' ' || event.code === 'Space') {
        event.preventDefault()
        if (session.isRecording) stopRecording()
        else void togglePlayback()
        return
      }
      if (key === 'Escape') {
        if (session.selectedNoteIds.length) session.setSelectedNoteIds([])
        return
      }
      if (mod && lower === 'z') {
        event.preventDefault()
        if (event.shiftKey) projectStore.redo()
        else projectStore.undo()
        return
      }
      if (mod && lower === 'y') {
        event.preventDefault()
        projectStore.redo()
        return
      }
      if (mod && lower === 'n') {
        event.preventDefault()
        session.setModal('new')
        return
      }
      if (mod && event.shiftKey && lower === 'e') {
        event.preventDefault()
        session.setModal('export')
        return
      }
      if (mod && lower === 'd') {
        event.preventDefault()
        duplicateSelectedClip()
        return
      }
      if (mod && lower === 'c') {
        event.preventDefault()
        if (session.dock === 'editor' && session.selectedNoteIds.length) copySelectedNotes()
        else copySelectedClips()
        return
      }
      if (mod && lower === 'x') {
        event.preventDefault()
        if (session.dock === 'editor' && session.selectedNoteIds.length) cutSelectedNotes()
        else cutSelectedClips()
        return
      }
      if (mod && lower === 'v') {
        event.preventDefault()
        pasteClipboard()
        return
      }
      if (mod && lower === 'a') {
        event.preventDefault()
        if (session.dock === 'editor') {
          const selected = getSelectedClip(projectStore.project, projectStore.selectedClipId)
          if (selected) session.setSelectedNoteIds(selected.clip.notes.map((note) => note.id))
        } else {
          projectStore.selectClips(
            projectStore.project.tracks.flatMap((track) => track.clips.map((clip) => clip.id)),
          )
        }
        return
      }
      if (key === 'Delete' || key === 'Backspace') {
        if (session.dock === 'editor' && session.selectedNoteIds.length) {
          const selected = getSelectedClip(projectStore.project, projectStore.selectedClipId)
          if (selected) {
            event.preventDefault()
            projectStore.updateNotes(
              selected.track.id,
              selected.clip.id,
              selected.clip.notes.filter((note) => !session.selectedNoteIds.includes(note.id)),
            )
            session.setSelectedNoteIds([])
            return
          }
        }
        if (projectStore.selectedClipIds.length || projectStore.selectedClipId) {
          event.preventDefault()
          deleteSelectedClip()
        }
        return
      }
      if (
        session.dock === 'editor' &&
        session.selectedNoteIds.length &&
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)
      ) {
        const selected = getSelectedClip(projectStore.project, projectStore.selectedClipId)
        if (selected) {
          event.preventDefault()
          const ids = new Set(session.selectedNoteIds)
          const { clip, track } = selected
          let notes = clip.notes
          if (key === 'ArrowUp' || key === 'ArrowDown') {
            const amount = (key === 'ArrowUp' ? 1 : -1) * (event.shiftKey ? 12 : 1)
            notes = notes.map((note) =>
              ids.has(note.id) ? { ...note, pitch: Math.max(24, Math.min(96, note.pitch + amount)) } : note,
            )
          } else {
            const amount =
              (key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? projectStore.project.timeSig : session.snap)
            notes = notes.map((note) =>
              ids.has(note.id)
                ? {
                    ...note,
                    start: Math.max(0, Math.min(clip.length - note.duration, note.start + amount)),
                  }
                : note,
            )
          }
          projectStore.updateNotes(track.id, clip.id, notes, { coalesce: `nudge-notes:${clip.id}` })
          const moved = notes.find((note) => ids.has(note.id))
          if (moved) {
            void engine
              .noteOn(track.instrument, track.id, moved.pitch, moved.velocity)
              .then((key) => window.setTimeout(() => engine.noteOff(key), 300))
          }
        }
        return
      }
      if (event.repeat || mod || event.altKey) return
      if (key === '?') {
        session.setModal('help')
        return
      }
      if (['1', '2', '3', '4', '5'].includes(key)) {
        const docks = ['editor', 'mixer', 'effects', 'loops', 'keys'] as const
        session.setDock(docks[Number(key) - 1])
        return
      }
      if (musicalTyping) return
      if (key === '+' || key === '=') {
        session.setZoom(session.zoom + 2)
        return
      }
      if (key === '-' || key === '_') {
        session.setZoom(session.zoom - 2)
        return
      }
      if (lower === 'l') {
        toggleLoop()
        return
      }
      if (lower === 'r') {
        void toggleRecording()
        return
      }
      if (lower === 'm' && projectStore.selectedTrackId) {
        toggleMute(projectStore.selectedTrackId)
        return
      }
      if (lower === 's' && projectStore.selectedTrackId) {
        toggleSolo(projectStore.selectedTrackId)
        return
      }
      if (lower === 't') {
        session.setModal('addTrack')
        return
      }
      if (lower === 'e') {
        session.setModal('export')
        return
      }
      if (key === 'ArrowLeft' || key === 'ArrowRight') {
        event.preventDefault()
        const bar = projectStore.project.timeSig
        const current = session.isPlaying ? engine.getPosition() : session.pausedBeat
        const next = Math.max(0, Math.round(current / bar) * bar + (key === 'ArrowRight' ? bar : -bar))
        seekTo(next)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Keep the document title in sync and clean up any stray transport state on unload.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        saveProjectToStorage(useProjectStore.getState().project)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  return (
    <div className="app">
      <TopBar />
      <Toolbar />
      <main className="workspace">
        <Arrangement />
        <EditorDock />
      </main>
      <StatusBar />
      <ModalRoot />
      <ToastStack />
      <div className="app-grain" aria-hidden="true" />
      <span className="sr-only" aria-live="polite">
        {isPlaying ? 'Playing' : 'Stopped'}
      </span>
    </div>
  )
}
