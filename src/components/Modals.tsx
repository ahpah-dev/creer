import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle,
  ArrowRight,
  Cable,
  Check,
  CheckCircle2,
  Download,
  Info,
  Keyboard,
  Loader2,
  Play,
  Plus,
  Sparkles,
  X,
} from 'lucide-react'
import type { InstrumentId, Note } from '../types'
import { INSTRUMENT_MAP, INSTRUMENTS } from '../data/instruments'
import { useProjectStore, projectStats } from '../store/project'
import { useSessionStore } from '../store/session'
import { engine } from '../audio/engine'
import { downloadBlob, renderProjectToWav, safeFilename } from '../audio/export'
import { addTrackWithStarterClip } from '../lib/tracks'
import { stopRecording } from '../lib/recording'
import { ALT_LABEL, contentEnd, formatDuration, MOD_LABEL, SHIFT_LABEL } from '../lib/utils'
import { TrackIcon } from './TrackIcon'

function ModalShell({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
  onClose,
  size = 'default',
  canClose = true,
}: {
  eyebrow: string
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
  size?: 'default' | 'wide' | 'tall'
  canClose?: boolean
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    panelRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && canClose) {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canClose, onClose])

  return createPortal(
    <div
      className="modal-backdrop"
      onPointerDown={(event) => {
        if (canClose && event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className={`modal-panel modal-${size}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={panelRef}
      >
        <div className="modal-head">
          <div>
            <span className="eyebrow">{eyebrow}</span>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-button modal-close" onClick={onClose} disabled={!canClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="modal-content">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

const Shortcut = ({ children, label }: { children: ReactNode; label: string }) => (
  <div className="shortcut-row">
    <span>{label}</span>
    <span className="shortcut-keys">{children}</span>
  </div>
)

function HelpModal({ onClose }: { onClose: () => void }) {
  const setDock = useSessionStore((state) => state.setDock)
  return (
    <ModalShell
      eyebrow="WELCOME TO CREER"
      title="A small studio for big ideas."
      subtitle="No setup, no accounts. Click, play, and shape something that feels like you."
      onClose={onClose}
      size="wide"
      footer={
        <>
          <span className="modal-footer-note">Everything is synthesized live in your browser.</span>
          <div className="modal-actions">
            <button className="button button-secondary" onClick={onClose}>
              Back to the studio
            </button>
            <button
              className="button button-primary"
              onClick={() => {
                setDock('loops')
                onClose()
              }}
            >
              Explore loops <ArrowRight size={14} />
            </button>
          </div>
        </>
      }
    >
      <div className="help-grid">
        <div className="help-intro">
          <div className="help-art" aria-hidden="true">
            <span className="help-orbit orbit-one" />
            <span className="help-orbit orbit-two" />
            <span className="help-note hn-one" />
            <span className="help-note hn-two" />
            <span className="help-note hn-three" />
            <Sparkles size={22} />
          </div>
          <div className="help-steps">
            <div>
              <span className="step-number">01</span>
              <p><strong>Press play.</strong> The demo is a real song. Move through it, solo a track, or just listen.</p>
            </div>
            <div>
              <span className="step-number">02</span>
              <p><strong>Double-click a lane</strong> to make a clip, then draw notes in the piano roll below.</p>
            </div>
            <div>
              <span className="step-number">03</span>
              <p><strong>Borrow a loop.</strong> Everything in the library is built to sit in the same pocket.</p>
            </div>
            <div>
              <span className="step-number">04</span>
              <p><strong>Plug in a keyboard.</strong> Enable MIDI in the top bar and play your hardware through any armed track.</p>
            </div>
          </div>
        </div>
        <div className="help-shortcuts">
          <div className="help-section-title">
            <Keyboard size={14} />
            <span>Keyboard shortcuts</span>
          </div>
          <div className="shortcut-grid">
            <Shortcut label="Play / pause"><kbd>Space</kbd></Shortcut>
            <Shortcut label="Undo / redo"><kbd>{MOD_LABEL}</kbd><kbd>Z</kbd><span> / </span><kbd>{SHIFT_LABEL}</kbd><kbd>Z</kbd></Shortcut>
            <Shortcut label="Toggle loop"><kbd>L</kbd></Shortcut>
            <Shortcut label="Record a take"><kbd>R</kbd></Shortcut>
            <Shortcut label="Mute / solo"><kbd>M</kbd><span> / </span><kbd>S</kbd></Shortcut>
            <Shortcut label="Duplicate clip"><kbd>{MOD_LABEL}</kbd><kbd>D</kbd></Shortcut>
            <Shortcut label="Delete selection"><kbd>⌫</kbd></Shortcut>
            <Shortcut label="Switch editor"><kbd>1</kbd><span>–</span><kbd>4</kbd></Shortcut>
            <Shortcut label="Free drag (no snap)"><kbd>{ALT_LABEL}</kbd><span>+</span><kbd>drag</kbd></Shortcut>
            <Shortcut label="Musical typing"><kbd>A</kbd><span>–</span><kbd>K</kbd></Shortcut>
            <Shortcut label="Nudge notes"><kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd></Shortcut>
          </div>
          <div className="help-tip">
            <Info size={14} />
            <p>Double-click a song section in the ruler to loop it. Drag the loop edges to choose your own range.</p>
          </div>
          <div className="help-tip midi-help-tip">
            <Cable size={14} />
            <p>MIDI keyboards connect through the MIDI button in the top bar. Notes follow the armed track and are captured while recording.</p>
          </div>
          <div className="help-signature">
            <span>CREER</span>
            <i />
            <span>v1.0</span>
            <em>made for making</em>
          </div>
        </div>
      </div>
    </ModalShell>
  )
}

function NewProjectModal({ onClose }: { onClose: () => void }) {
  const newProject = useProjectStore((state) => state.newProject)
  const resetToDemo = useProjectStore((state) => state.resetToDemo)
  const setPlaying = useSessionStore((state) => state.setPlaying)
  const setPausedBeat = useSessionStore((state) => state.setPausedBeat)
  const setDock = useSessionStore((state) => state.setDock)
  const setSelectedNoteIds = useSessionStore((state) => state.setSelectedNoteIds)
  const toast = useSessionStore((state) => state.toast)

  const choose = (kind: 'blank' | 'demo') => {
    if (useSessionStore.getState().isRecording) stopRecording()
    engine.stop()
    engine.stopPreview()
    setPlaying(false)
    setPausedBeat(0)
    setSelectedNoteIds([])
    setDock('editor')
    if (kind === 'demo') {
      resetToDemo()
      toast('Golden Hour is back', 'The demo project has been restored.', 'success')
    } else {
      newProject()
      toast('Blank session ready', 'A new song with four tracks is waiting for you.', 'success')
    }
    onClose()
  }

  return (
    <ModalShell
      eyebrow="NEW SESSION"
      title="Start with a clean page."
      subtitle="Your current session will be replaced. You can save a copy first from the project menu."
      onClose={onClose}
      footer={
        <div className="modal-actions modal-actions-end">
          <button className="button button-secondary" onClick={onClose}>Cancel</button>
        </div>
      }
    >
      <div className="new-project-grid">
        <button className="session-card blank-card" onClick={() => choose('blank')}>
          <div className="session-art blank-art">
            <span className="blank-line" />
            <span className="blank-line short" />
            <span className="blank-line" />
            <span className="blank-plus">+</span>
          </div>
          <div className="session-copy">
            <span className="eyebrow">EMPTY ROOM</span>
            <h3>Blank session</h3>
            <p>Four tracks, a clean grid, and nothing but possibility.</p>
            <span className="session-link">Start fresh <ArrowRight size={13} /></span>
          </div>
        </button>
        <button className="session-card demo-card" onClick={() => choose('demo')}>
          <div className="session-art demo-art">
            <span className="demo-sun" />
            <span className="demo-wave" />
            <span className="demo-label">GOLDEN<br />HOUR</span>
          </div>
          <div className="session-copy">
            <span className="eyebrow">OPEN THE DEMO</span>
            <h3>Golden Hour</h3>
            <p>A warm six-track sketch at 96 BPM. The fastest way to hear what Creer can do.</p>
            <span className="session-link">Load the demo <ArrowRight size={13} /></span>
          </div>
        </button>
      </div>
    </ModalShell>
  )
}

function ExportModal({ onClose }: { onClose: () => void }) {
  const project = useProjectStore((state) => state.project)
  const toast = useSessionStore((state) => state.toast)
  const [working, setWorking] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const duration = (Math.max(project.timeSig, contentEnd(project)) * 60) / project.bpm
  const stats = projectStats(project)
  const estimatedSize = ((duration + 2.8) * 44100 * 4) / (1024 * 1024)

  useEffect(() => {
    if (!working) return
    setElapsed(0)
    const startedAt = performance.now()
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((performance.now() - startedAt) / 1000))
    }, 500)
    return () => window.clearInterval(timer)
  }, [working])

  const handleExport = async () => {
    setWorking(true)
    if (useSessionStore.getState().isRecording) stopRecording()
    if (useSessionStore.getState().isPlaying) {
      engine.stop()
      useSessionStore.getState().setPlaying(false)
      useSessionStore.getState().setPausedBeat(engine.getPosition())
    }
    try {
      const { blob, duration: renderedDuration } = await renderProjectToWav(project)
      downloadBlob(blob, `${safeFilename(project.name)}.wav`)
      toast('Your mix is ready', `${safeFilename(project.name)}.wav · ${formatDuration(renderedDuration)} · 44.1 kHz`, 'success')
      setWorking(false)
      onClose()
    } catch (error) {
      console.error(error)
      toast('The export failed', 'Try closing other audio apps and exporting again.', 'warn')
      setWorking(false)
    }
  }

  return (
    <ModalShell
      eyebrow="EXPORT AUDIO"
      title="Take your song with you."
      subtitle="A single stereo WAV, rendered offline with every track, send and master effect included."
      onClose={onClose}
      canClose={!working}
      footer={
        <>
          <span className="modal-footer-note">Nothing leaves this device. Rendered locally.</span>
          <div className="modal-actions">
            <button className="button button-secondary" onClick={onClose} disabled={working}>Cancel</button>
            <button className="button button-primary export-confirm" onClick={() => void handleExport()} disabled={working}>
              {working ? <Loader2 size={15} className="spin" /> : <Download size={15} />}
              {working ? 'Rendering your mix…' : 'Export WAV'}
            </button>
          </div>
        </>
      }
    >
      <div className="export-card">
        <div className="export-art">
          <div className="export-disc">
            <span className="export-disc-label">CREER</span>
            <span className="export-disc-title">{project.name}</span>
          </div>
          <div className="export-ring" />
        </div>
        <div className="export-details">
          <span className="eyebrow">SONG MASTER</span>
          <h3>{project.name}</h3>
          <div className="export-meta-grid">
            <div><span>Tracks</span><strong>{stats.tracks}</strong></div>
            <div><span>Tempo</span><strong>{project.bpm} BPM</strong></div>
            <div><span>Key</span><strong>{project.key} {project.scale}</strong></div>
            <div><span>Length</span><strong>{formatDuration(duration)}</strong></div>
          </div>
          <div className="export-format-row">
            <div className="format-icon">WAV</div>
            <div>
              <strong>WAV · 44.1 kHz · 16-bit stereo</strong>
              <span>~{estimatedSize.toFixed(1)} MB · with reverb tail</span>
            </div>
            <Check size={15} className="format-check" />
          </div>
          <p className="export-note">The full arrangement is rendered, from the first bar to the last clip. Loop settings are ignored.</p>
          {working && (
            <div className="export-progress">
              <div className="export-progress-bar"><i /></div>
              <span>
                Bouncing {project.tracks.length} tracks through the master bus · {formatDuration(elapsed)} elapsed
              </span>
              <span className="export-progress-note">Offline rendering can take up to a minute for a full song.</span>
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  )
}

const DEMO_NOTES: Record<Exclude<InstrumentId, 'drums'>, Omit<Note, 'id'>[]> = {
  piano: [
    { pitch: 57, start: 0, duration: 1.8, velocity: 0.7 },
    { pitch: 60, start: 0, duration: 1.8, velocity: 0.68 },
    { pitch: 64, start: 0, duration: 1.8, velocity: 0.65 },
    { pitch: 67, start: 0, duration: 1.8, velocity: 0.62 },
    { pitch: 55, start: 2, duration: 1.8, velocity: 0.6 },
    { pitch: 59, start: 2, duration: 1.8, velocity: 0.58 },
    { pitch: 62, start: 2, duration: 1.8, velocity: 0.56 },
    { pitch: 67, start: 2, duration: 1.8, velocity: 0.52 },
  ],
  electric: [
    { pitch: 57, start: 0.25, duration: 1.3, velocity: 0.66 },
    { pitch: 60, start: 0.25, duration: 1.3, velocity: 0.62 },
    { pitch: 64, start: 0.25, duration: 1.3, velocity: 0.58 },
    { pitch: 67, start: 1.75, duration: 0.7, velocity: 0.55 },
    { pitch: 55, start: 2.25, duration: 1.5, velocity: 0.62 },
    { pitch: 59, start: 2.25, duration: 1.5, velocity: 0.58 },
    { pitch: 62, start: 2.25, duration: 1.5, velocity: 0.56 },
    { pitch: 67, start: 2.25, duration: 1.5, velocity: 0.5 },
  ],
  pad: [
    { pitch: 45, start: 0, duration: 3.8, velocity: 0.5 },
    { pitch: 52, start: 0, duration: 3.8, velocity: 0.46 },
    { pitch: 57, start: 0, duration: 3.8, velocity: 0.45 },
    { pitch: 60, start: 0, duration: 3.8, velocity: 0.4 },
    { pitch: 64, start: 0, duration: 3.8, velocity: 0.36 },
  ],
  bass: [
    { pitch: 45, start: 0, duration: 0.8, velocity: 0.9 },
    { pitch: 45, start: 1.5, duration: 0.35, velocity: 0.6 },
    { pitch: 52, start: 2, duration: 0.7, velocity: 0.8 },
    { pitch: 45, start: 3.25, duration: 0.45, velocity: 0.55 },
  ],
  pluck: [
    { pitch: 76, start: 0, duration: 0.7, velocity: 0.6 },
    { pitch: 72, start: 0.75, duration: 0.4, velocity: 0.52 },
    { pitch: 74, start: 1.5, duration: 0.7, velocity: 0.55 },
    { pitch: 76, start: 2.25, duration: 1.1, velocity: 0.6 },
    { pitch: 79, start: 3.5, duration: 0.4, velocity: 0.48 },
  ],
  bell: [
    { pitch: 81, start: 0.5, duration: 0.6, velocity: 0.35 },
    { pitch: 84, start: 1.5, duration: 0.6, velocity: 0.3 },
    { pitch: 79, start: 2.5, duration: 0.6, velocity: 0.33 },
    { pitch: 76, start: 3.5, duration: 0.6, velocity: 0.28 },
  ],
  strings: [
    { pitch: 57, start: 0, duration: 3.8, velocity: 0.45 },
    { pitch: 60, start: 0, duration: 3.8, velocity: 0.42 },
    { pitch: 64, start: 0, duration: 3.8, velocity: 0.4 },
    { pitch: 67, start: 0, duration: 3.8, velocity: 0.38 },
  ],
  organ: [
    { pitch: 57, start: 0, duration: 1.5, velocity: 0.55 },
    { pitch: 60, start: 0, duration: 1.5, velocity: 0.52 },
    { pitch: 64, start: 0, duration: 1.5, velocity: 0.5 },
    { pitch: 57, start: 2, duration: 1.7, velocity: 0.5 },
    { pitch: 60, start: 2, duration: 1.7, velocity: 0.48 },
    { pitch: 67, start: 2, duration: 1.7, velocity: 0.44 },
  ],
  marimba: [
    { pitch: 69, start: 0, duration: 0.45, velocity: 0.55 },
    { pitch: 72, start: 0.5, duration: 0.45, velocity: 0.5 },
    { pitch: 76, start: 1, duration: 0.6, velocity: 0.55 },
    { pitch: 74, start: 2, duration: 0.45, velocity: 0.48 },
    { pitch: 72, start: 2.5, duration: 0.45, velocity: 0.5 },
    { pitch: 69, start: 3, duration: 0.8, velocity: 0.52 },
  ],
}

function AddTrackModal({ onClose }: { onClose: () => void }) {
  const [instrument, setInstrument] = useState<InstrumentId>('piano')
  const [name, setName] = useState('')
  const [starterClip, setStarterClip] = useState(true)
  const [previewing, setPreviewing] = useState(false)
  const info = INSTRUMENT_MAP[instrument]

  useEffect(() => {
    return () => engine.stopPreview()
  }, [])

  const preview = async () => {
    if (previewing) {
      engine.stopPreview()
      setPreviewing(false)
      return
    }
    const notes =
      instrument === 'drums'
        ? [
            { pitch: 36, start: 0, duration: 0.2, velocity: 0.9 },
            { pitch: 42, start: 0.5, duration: 0.1, velocity: 0.45 },
            { pitch: 38, start: 1, duration: 0.2, velocity: 0.8 },
            { pitch: 42, start: 1.5, duration: 0.1, velocity: 0.4 },
            { pitch: 36, start: 2, duration: 0.2, velocity: 0.85 },
            { pitch: 42, start: 2.5, duration: 0.1, velocity: 0.45 },
            { pitch: 38, start: 3, duration: 0.2, velocity: 0.82 },
          ]
        : DEMO_NOTES[instrument]
    setPreviewing(true)
    await engine.previewNotes(instrument, notes, 96, 4, () => setPreviewing(false))
  }

  const select = (next: InstrumentId) => {
    if (previewing) {
      engine.stopPreview()
      setPreviewing(false)
    }
    setInstrument(next)
  }

  const create = () => {
    engine.stopPreview()
    addTrackWithStarterClip(instrument, {
      name: name.trim() || undefined,
      starterClip,
    })
    onClose()
  }

  return (
    <ModalShell
      eyebrow="NEW TRACK"
      title="What do you hear?"
      subtitle="Choose a sound. You can change it later from the Sounds & Keys panel."
      onClose={onClose}
      footer={
        <>
          <button className={`preview-sound ${previewing ? 'is-playing' : ''}`} onClick={() => void preview()}>
            {previewing ? <span className="preview-stop-icon" /> : <Play size={13} fill="currentColor" />}
            {previewing ? 'Stop preview' : 'Preview sound'}
          </button>
          <div className="modal-actions">
            <button className="button button-secondary" onClick={onClose}>Cancel</button>
            <button className="button button-primary" onClick={create}>
              <Plus size={15} /> Add {info.shortName} track
            </button>
          </div>
        </>
      }
    >
      <div className="instrument-grid">
        {INSTRUMENTS.map((item) => (
          <button
            key={item.id}
            className={`instrument-choice ${instrument === item.id ? 'is-selected' : ''}`}
            onClick={() => select(item.id)}
          >
            <span className="instrument-choice-icon" style={{ '--instrument-color': item.color } as CSSProperties}>
              <TrackIcon instrument={item.id} size={16} />
            </span>
            <span className="instrument-choice-copy">
              <strong>{item.name}</strong>
              <em>{item.description}</em>
            </span>
            <span className="instrument-choice-category">{item.category}</span>
            {instrument === item.id && <span className="instrument-choice-check"><Check size={11} /></span>}
          </button>
        ))}
      </div>
      <div className="add-track-options">
        <label className="field-block">
          <span className="field-label">TRACK NAME</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={info.name}
            maxLength={32}
            onKeyDown={(event) => {
              if (event.key === 'Enter') create()
            }}
          />
        </label>
        <label className="toggle-field">
          <input
            type="checkbox"
            checked={starterClip}
            onChange={(event) => setStarterClip(event.target.checked)}
          />
          <span className="toggle-track"><i /></span>
          <span>
            <strong>Start with an empty clip</strong>
            <em>Drop straight into the piano roll.</em>
          </span>
        </label>
      </div>
    </ModalShell>
  )
}

export function ModalRoot() {
  const modal = useSessionStore((state) => state.modal)
  const setModal = useSessionStore((state) => state.setModal)
  if (!modal) return null
  const close = () => setModal(null)
  if (modal === 'help') return <HelpModal onClose={close} />
  if (modal === 'new') return <NewProjectModal onClose={close} />
  if (modal === 'export') return <ExportModal onClose={close} />
  if (modal === 'addTrack') return <AddTrackModal onClose={close} />
  return null
}

export function ToastStack() {
  const toasts = useSessionStore((state) => state.toasts)
  const dismiss = useSessionStore((state) => state.dismissToast)
  if (!toasts.length) return null
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((toast) => {
        const Icon = toast.tone === 'success' ? CheckCircle2 : toast.tone === 'warn' ? AlertTriangle : Info
        return (
          <div key={toast.id} className={`toast toast-${toast.tone ?? 'default'}`}>
            <Icon size={16} className="toast-icon" />
            <div>
              <strong>{toast.title}</strong>
              {toast.detail && <p>{toast.detail}</p>}
            </div>
            <button className="toast-close" onClick={() => dismiss(toast.id)} aria-label="Dismiss">
              <X size={12} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
