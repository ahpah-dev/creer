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
  Search,
  Sparkles,
  Square,
  X,
} from 'lucide-react'
import type { InstrumentId } from '../types'
import { INSTRUMENT_MAP, INSTRUMENTS } from '../data/instruments'
import { getAuditionNotes } from '../lib/auditions'
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
              <p><strong>Browse the library.</strong> Thirty-six synthesized sounds, including six drum kits, are waiting in Sounds &amp; Keys, each with a one-click audition.</p>
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
            <Shortcut label="Copy / cut / paste"><kbd>{MOD_LABEL}</kbd><kbd>C</kbd><span>/</span><kbd>X</kbd><span>/</span><kbd>V</kbd></Shortcut>
            <Shortcut label="Delete selection"><kbd>⌫</kbd></Shortcut>
            <Shortcut label="Switch editor"><kbd>1</kbd><span>–</span><kbd>5</kbd></Shortcut>
            <Shortcut label="Free drag (no snap)"><kbd>{ALT_LABEL}</kbd><span>+</span><kbd>drag</kbd></Shortcut>
            <Shortcut label="Musical typing"><kbd>A</kbd><span>–</span><kbd>K</kbd></Shortcut>
            <Shortcut label="Nudge notes"><kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd></Shortcut>
          </div>
          <div className="help-tip">
            <Info size={14} />
            <p>
              Drag a note up or down to hear each pitch as it moves. Zoom the piano roll
              with − / + or Ctrl/⌘ + scroll. Drag the grip above the editor tabs to make
              the piano roll taller; double-click it to reset. Drag across empty timeline
              space to box-select clips, or use Draw/Select in the piano roll. Copy, cut
              and paste work in both, and dragging any selected note moves the whole
              selection together. Hover a song section and use the pencil to rename
              or recolor it; the plus adds a new section. Open the SWING pill in the top
              bar to add 8th- or 16th-note swing to playback and exports. The Effects tab
              builds an insert chain on any track or the master.
            </p>
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
            <span>v1.7.1</span>
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
    const notes = getAuditionNotes(instrument)
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

const SOUND_CATEGORIES = ['All', 'Keys', 'Bass', 'Pads', 'Leads', 'Drums'] as const

function SoundLibraryModal({ onClose }: { onClose: () => void }) {
  const project = useProjectStore((state) => state.project)
  const selectedTrackId = useProjectStore((state) => state.selectedTrackId)
  const updateTrack = useProjectStore((state) => state.updateTrack)
  const track = project.tracks.find((item) => item.id === selectedTrackId) ?? project.tracks[0]
  const [category, setCategory] = useState<(typeof SOUND_CATEGORIES)[number]>('All')
  const [search, setSearch] = useState('')
  const [previewing, setPreviewing] = useState<InstrumentId | null>(null)

  useEffect(() => {
    return () => engine.stopPreview()
  }, [])

  if (!track) return null
  const current = INSTRUMENT_MAP[track.instrument]
  const query = search.trim().toLowerCase()
  const sounds = INSTRUMENTS.filter((instrument) => {
    if (category !== 'All' && instrument.category !== category) return false
    if (!query) return true
    return `${instrument.name} ${instrument.category} ${instrument.description}`
      .toLowerCase()
      .includes(query)
  })

  const previewSound = (instrument: InstrumentId) => {
    if (previewing === instrument) {
      engine.stopPreview()
      setPreviewing(null)
      return
    }
    engine.stopPreview()
    setPreviewing(instrument)
    void engine.previewNotes(instrument, getAuditionNotes(instrument), 96, 4, () => {
      setPreviewing((existing) => (existing === instrument ? null : existing))
    })
  }

  const apply = (instrument: InstrumentId) => {
    if (previewing && previewing !== instrument) {
      engine.stopPreview()
      setPreviewing(null)
    }
    updateTrack(track.id, { instrument })
  }

  const createTrack = () => {
    engine.stopPreview()
    addTrackWithStarterClip(track.instrument)
    onClose()
  }

  return (
    <ModalShell
      eyebrow="INSTRUMENT LIBRARY"
      title="Find your next sound."
      subtitle={`${INSTRUMENTS.length} instruments, all synthesized in your browser. Choose one to load it on the current track.`}
      onClose={onClose}
      size="wide"
      footer={
        <>
          <span className="modal-footer-note">
            Loaded on <strong>{track.name}</strong>
            {track.name !== current.name ? ` · ${current.name}` : ''}
          </span>
          <div className="modal-actions">
            <button className="button button-secondary" onClick={createTrack}>
              <Plus size={14} /> New track with {current.shortName}
            </button>
            <button className="button button-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </>
      }
    >
      <div className="sound-library-toolbar">
        <div className="sound-library-categories">
          {SOUND_CATEGORIES.map((item) => (
            <button
              key={item}
              className={`filter-chip ${category === item ? 'is-active' : ''}`}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <label className="sound-library-search">
          <Search size={13} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search the library"
            aria-label="Search the instrument library"
          />
          <span>{sounds.length}</span>
        </label>
      </div>

      <div className="sound-library-grid">
        {sounds.map((instrument) => {
          const selected = track.instrument === instrument.id
          const playing = previewing === instrument.id
          return (
            <div
              key={instrument.id}
              className={`library-sound-card ${selected ? 'is-selected' : ''} ${playing ? 'is-previewing' : ''}`}
            >
              <button className="library-sound-main" onClick={() => apply(instrument.id)} aria-pressed={selected}>
                <span
                  className="library-sound-icon"
                  style={{ '--instrument-color': instrument.color } as CSSProperties}
                >
                  <TrackIcon instrument={instrument.id} size={16} />
                </span>
                <span className="library-sound-copy">
                  <span className="library-sound-category">{instrument.category}</span>
                  <strong>{instrument.name}</strong>
                  <em>{instrument.description}</em>
                </span>
                {selected && (
                  <span className="library-sound-loaded" title="Loaded on this track">
                    <Check size={9} />
                  </span>
                )}
              </button>
              <button
                className={`library-sound-preview ${playing ? 'is-playing' : ''}`}
                onClick={() => previewSound(instrument.id)}
                aria-label={playing ? `Stop preview of ${instrument.name}` : `Preview ${instrument.name}`}
                title={playing ? 'Stop preview' : 'Preview sound'}
              >
                {playing ? <Square size={8} fill="currentColor" /> : <Play size={10} fill="currentColor" />}
              </button>
            </div>
          )
        })}
        {!sounds.length && (
          <div className="sound-library-empty">
            <span>No instruments found</span>
            <p>Try another search or category.</p>
            <button
              className="button button-secondary"
              onClick={() => {
                setSearch('')
                setCategory('All')
              }}
            >
              Show all sounds
            </button>
          </div>
        )}
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
  if (modal === 'sounds') return <SoundLibraryModal onClose={close} />
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
