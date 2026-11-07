import { useEffect, useRef } from 'react'
import {
  Circle,
  Layers,
  Library,
  Menu,
  Pause,
  Pencil,
  Piano,
  Play,
  Redo2,
  SkipBack,
  SlidersVertical,
  Square,
  Undo2,
} from 'lucide-react'
import { engine } from '../audio/engine'
import { useProjectStore } from '../store/project'
import { useSessionStore } from '../store/session'
import { useStudioRuntime } from '../lib/runtime'
import { rewindTransport, togglePlayback } from '../lib/transport'
import { stopRecording, toggleRecording } from '../lib/recording'
import { formatBeatPosition } from '../lib/utils'
import { useMobileStore, type MobileTab } from './store'
import { TracksView } from './TracksView'
import { PlayView } from './PlayView'
import { EditView } from './EditView'
import { MixerView } from './MixerView'
import { LibraryView } from './LibraryView'
import { ProjectSheet, SoundSheet, TrackSheet } from './Sheets'

const TABS: { id: MobileTab; label: string; icon: typeof Layers }[] = [
  { id: 'tracks', label: 'Tracks', icon: Layers },
  { id: 'play', label: 'Play', icon: Piano },
  { id: 'edit', label: 'Edit', icon: Pencil },
  { id: 'mixer', label: 'Mixer', icon: SlidersVertical },
  { id: 'library', label: 'Library', icon: Library },
]

function Readout() {
  const ref = useRef<HTMLElement>(null)
  const timeSig = useProjectStore((state) => state.project.timeSig)
  useEffect(() => {
    let frame = 0
    let last = ''
    const loop = () => {
      const session = useSessionStore.getState()
      const beat = session.isPlaying ? engine.getPosition() : session.pausedBeat
      const text = formatBeatPosition(beat, timeSig)
      if (text !== last && ref.current) {
        ref.current.textContent = text
        last = text
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [timeSig])
  return <strong ref={ref} className="m-readout-pos">01.1.1</strong>
}

function TopBar() {
  const bpm = useProjectStore((state) => state.project.bpm)
  const canUndo = useProjectStore((state) => state.past.length > 0)
  const canRedo = useProjectStore((state) => state.future.length > 0)
  const undo = useProjectStore((state) => state.undo)
  const redo = useProjectStore((state) => state.redo)
  const isPlaying = useSessionStore((state) => state.isPlaying)
  const isRecording = useSessionStore((state) => state.isRecording)
  const setProjectSheet = useMobileStore((state) => state.setProjectSheet)

  return (
    <header className="m-top">
      <button className="m-icon-btn" onClick={() => setProjectSheet(true)} aria-label="Project menu">
        <Menu size={21} />
      </button>
      <div className="m-transport" role="group" aria-label="Transport">
        <button className="m-icon-btn" onClick={() => rewindTransport()} aria-label="Back to start">
          <SkipBack size={19} />
        </button>
        <button
          className={`m-play ${isPlaying ? 'is-on' : ''}`}
          onClick={() => {
            if (isRecording) stopRecording()
            else void togglePlayback()
          }}
          aria-label={isPlaying ? (isRecording ? 'Stop recording' : 'Pause') : 'Play'}
        >
          {isPlaying ? (
            isRecording ? <Square size={19} fill="currentColor" /> : <Pause size={22} fill="currentColor" />
          ) : (
            <Play size={22} fill="currentColor" />
          )}
        </button>
        <button
          className={`m-rec ${isRecording ? 'is-on' : ''}`}
          onClick={() => void toggleRecording()}
          aria-label={isRecording ? 'Stop recording' : 'Record'}
          aria-pressed={isRecording}
        >
          <Circle size={17} fill="currentColor" />
        </button>
      </div>
      <button className="m-readout" onClick={() => setProjectSheet(true)} aria-label="Position and tempo">
        <Readout />
        <span>{bpm} BPM</span>
      </button>
      <div className="m-undo">
        <button className="m-icon-btn" onClick={undo} disabled={!canUndo} aria-label="Undo">
          <Undo2 size={19} />
        </button>
        <button className="m-icon-btn m-redo" onClick={redo} disabled={!canRedo} aria-label="Redo">
          <Redo2 size={19} />
        </button>
      </div>
    </header>
  )
}

function TabBar() {
  const tab = useMobileStore((state) => state.tab)
  const setTab = useMobileStore((state) => state.setTab)
  return (
    <nav className="m-tabs" aria-label="Sections">
      {TABS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          className={tab === id ? 'is-on' : ''}
          onClick={() => setTab(id)}
          aria-current={tab === id ? 'page' : undefined}
        >
          <Icon size={22} strokeWidth={tab === id ? 2.2 : 1.8} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  )
}

function Toasts() {
  const toasts = useSessionStore((state) => state.toasts)
  const dismiss = useSessionStore((state) => state.dismissToast)
  if (!toasts.length) return null
  return (
    <div className="m-toasts" aria-live="polite">
      {toasts.map((toast) => (
        <button key={toast.id} className={`m-toast tone-${toast.tone ?? 'default'}`} onClick={() => dismiss(toast.id)}>
          <strong>{toast.title}</strong>
          {toast.detail && <span>{toast.detail}</span>}
        </button>
      ))}
    </div>
  )
}

export default function MobileApp() {
  useStudioRuntime()
  const tab = useMobileStore((state) => state.tab)
  const toast = useSessionStore((state) => state.toast)
  const isRecording = useSessionStore((state) => state.isRecording)

  // Keep iOS from muting WebAudio when the silent switch is on, and stop the page rubber-banding.
  useEffect(() => {
    const nav = navigator as Navigator & { audioSession?: { type: string } }
    try {
      if (nav.audioSession) nav.audioSession.type = 'playback'
    } catch {
      /* unsupported */
    }
    document.documentElement.classList.add('m-root')

    // iOS only lets audio start from touchend/click, so unlock the context on the first of those.
    const events = ['touchend', 'click', 'pointerup', 'keydown'] as const
    const unlock = () => {
      void engine.ensureContext().then((ctx) => {
        if (ctx.state === 'running') events.forEach((name) => window.removeEventListener(name, unlock, true))
      })
    }
    events.forEach((name) => window.addEventListener(name, unlock, true))

    // Safari's pinch-to-zoom would otherwise fight the timeline's own pinch gesture.
    const blockGesture = (event: Event) => event.preventDefault()
    document.addEventListener('gesturestart', blockGesture)
    document.addEventListener('gesturechange', blockGesture)
    return () => {
      document.documentElement.classList.remove('m-root')
      events.forEach((name) => window.removeEventListener(name, unlock, true))
      document.removeEventListener('gesturestart', blockGesture)
      document.removeEventListener('gesturechange', blockGesture)
    }
  }, [])

  // The shared recording flow switches the desktop dock; on mobile, stay on the Play tab while recording.
  useEffect(() => {
    if (isRecording) useMobileStore.getState().setTab('play')
  }, [isRecording])

  useEffect(() => {
    try {
      if (localStorage.getItem('creer.m.welcomed')) return
    } catch {
      /* storage can be unavailable */
    }
    const timer = window.setTimeout(() => {
      toast('Welcome to Creer', 'Tap play to hear the demo, or open Library to spark a new idea.')
      try {
        localStorage.setItem('creer.m.welcomed', '1')
      } catch {
        /* storage can be unavailable */
      }
    }, 900)
    return () => window.clearTimeout(timer)
  }, [toast])

  return (
    <div className={`m-app ${isRecording ? 'is-recording' : ''}`}>
      <TopBar />
      <main className="m-main">
        {tab === 'tracks' && <TracksView />}
        {tab === 'play' && <PlayView />}
        {tab === 'edit' && <EditView />}
        {tab === 'mixer' && <MixerView />}
        {tab === 'library' && <LibraryView />}
      </main>
      <TabBar />
      <Toasts />
      <ProjectSheet />
      <TrackSheet />
      <SoundSheet />
    </div>
  )
}
