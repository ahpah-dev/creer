import { useEffect, useRef, useState } from 'react'
import {
  AudioWaveform,
  Check,
  ChevronDown,
  Circle,
  Download,
  FolderOpen,
  HelpCircle,
  Keyboard,
  Loader2,
  Pause,
  Play,
  Redo2,
  Repeat2,
  Search,
  SkipBack,
  Square,
  Undo2,
  X,
} from 'lucide-react'
import { useProjectStore } from '../store/project'
import { useSessionStore } from '../store/session'
import { engine } from '../audio/engine'
import {
  pauseTransport,
  playTransport,
  rewindTransport,
  toggleLoop,
  toggleMetronome,
  stopTransport,
} from '../lib/transport'
import { formatBeatPosition, formatTime, MOD_LABEL, SHIFT_LABEL } from '../lib/utils'
import { importProjectFile, saveProjectCopy } from '../lib/projectFile'
import { toggleRecording } from '../lib/recording'
import { MidiControl } from './MidiControl'
import { GuideButton } from './QuickStart'

const SONG_KEYS = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B']

function usePopover() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open])
  return { open, setOpen, ref }
}

function Brand() {
  return (
    <div className="brand" aria-label="Creer">
      <svg viewBox="0 0 44 44" className="brand-mark" aria-hidden="true">
        <circle cx="22" cy="22" r="19.5" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.7" />
        <path
          d="M10 23.5c3.2 0 3.2-8.4 6.4-8.4s3.2 16 6.4 16 3.6-12 6.8-12 2.6 4.4 4.4 4.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
      </svg>
      <span className="brand-word">Creer</span>
    </div>
  )
}

function TransportReadout() {
  const isPlaying = useSessionStore((state) => state.isPlaying)
  const pausedBeat = useSessionStore((state) => state.pausedBeat)
  const project = useProjectStore((state) => state.project)
  const [beat, setBeat] = useState(pausedBeat)

  useEffect(() => {
    let frame = 0
    let last = 0
    const update = (time: number) => {
      if (time - last > 45) {
        setBeat(isPlaying ? engine.getPosition() : pausedBeat)
        last = time
      }
      frame = window.requestAnimationFrame(update)
    }
    setBeat(isPlaying ? engine.getPosition() : pausedBeat)
    frame = window.requestAnimationFrame(update)
    return () => window.cancelAnimationFrame(frame)
  }, [isPlaying, pausedBeat])

  return (
    <div className="transport-readout" aria-live="off">
      <div className="readout-main">
        <span className="readout-label">BAR</span>
        <span className="readout-position">{formatBeatPosition(beat, project.timeSig)}</span>
      </div>
      <div className="readout-time">
        <span className="readout-clock">{formatTime((beat * 60) / project.bpm)}</span>
        <span className="readout-meter">{project.timeSig}/4</span>
      </div>
    </div>
  )
}

function ProjectMenu() {
  const { open, setOpen, ref } = usePopover()
  const fileRef = useRef<HTMLInputElement>(null)
  const setModal = useSessionStore((state) => state.setModal)

  return (
    <div className="project-menu-wrap" ref={ref}>
      <input
        ref={fileRef}
        type="file"
        accept=".json,.creer,application/json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void importProjectFile(file)
          event.target.value = ''
        }}
      />
      <button
        className={`icon-button project-menu-trigger ${open ? 'is-active' : ''}`}
        onClick={() => setOpen(!open)}
        aria-label="Project menu"
        data-tip="Project menu"
      >
        <ChevronDown size={15} />
      </button>
      {open && (
        <div className="popover project-popover">
          <div className="popover-heading">Project</div>
          <button
            className="menu-item"
            onClick={() => {
              setOpen(false)
              setModal('new')
            }}
          >
            <SparkIcon /> New session
            <span className="menu-shortcut">{MOD_LABEL}N</span>
          </button>
          <button
            className="menu-item"
            onClick={() => {
              setOpen(false)
              fileRef.current?.click()
            }}
          >
            <FolderOpen size={15} /> Open project…
          </button>
          <button
            className="menu-item"
            onClick={() => {
              setOpen(false)
              saveProjectCopy()
            }}
          >
            <Download size={15} /> Save a copy
          </button>
          <div className="menu-divider" />
          <button
            className="menu-item"
            onClick={() => {
              setOpen(false)
              setModal('export')
            }}
          >
            <Download size={15} /> Export audio…
            <span className="menu-shortcut">{SHIFT_LABEL}{MOD_LABEL}E</span>
          </button>
          <div className="menu-divider" />
          <button
            className="menu-item"
            onClick={() => {
              setOpen(false)
              setModal('help')
            }}
          >
            <Keyboard size={15} /> Shortcuts & guide
          </button>
        </div>
      )}
    </div>
  )
}

function SparkIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 1.5l1.4 4.1 4.1 1.4-4.1 1.4L8 12.5 6.6 8.4 2.5 7l4.1-1.4L8 1.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  )
}

function SongSettings() {
  const { open, setOpen, ref } = usePopover()
  const project = useProjectStore((state) => state.project)
  const updateProject = useProjectStore((state) => state.updateProject)
  const [bpmDraft, setBpmDraft] = useState(String(project.bpm))
  useEffect(() => setBpmDraft(String(project.bpm)), [project.bpm])

  const commitBpm = (value: string) => {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) {
      setBpmDraft(String(project.bpm))
      return
    }
    const next = Math.max(40, Math.min(240, Math.round(parsed)))
    updateProject({ bpm: next })
    setBpmDraft(String(next))
  }

  const nudgeBpm = (direction: number) => {
    const next = Math.max(40, Math.min(240, project.bpm + direction))
    updateProject({ bpm: next })
    setBpmDraft(String(next))
  }

  const keyLabel = `${project.key} ${project.scale === 'minor' ? 'min' : 'maj'}`
  const swing = project.swing
  const updateSwing = (
    patch: Partial<typeof swing>,
    coalesce?: string,
  ) => {
    updateProject(
      { swing: { ...swing, ...patch } },
      coalesce ? { coalesce } : undefined,
    )
  }

  return (
    <div className="song-settings" ref={ref}>
      <button
        className={`meta-pill ${open ? 'is-active' : ''}`}
        onClick={() => setOpen(!open)}
        aria-label="Song settings"
        data-tip="Song settings"
      >
        <span className="meta-pill-label">TEMPO</span>
        <span className="meta-pill-value">{project.bpm}</span>
      </button>
      <button
        className={`meta-pill key-pill ${open ? 'is-active' : ''}`}
        onClick={() => setOpen(!open)}
        aria-label="Song key"
        data-tip="Key & meter"
      >
        <span className="meta-pill-label">KEY</span>
        <span className="meta-pill-value">{keyLabel}</span>
      </button>
      <button
        className={`meta-pill swing-pill ${open ? 'is-active' : ''} ${swing.enabled ? 'is-on' : ''}`}
        onClick={() => setOpen(!open)}
        aria-label="Swing settings"
        data-tip="Swing"
      >
        <span className="meta-pill-label">SWING</span>
        <span className="meta-pill-value">
          <AudioWaveform size={10} />
          {swing.enabled ? `${Math.round(swing.amount)}%` : 'OFF'}
        </span>
      </button>
      {open && (
        <div className="popover song-popover">
          <div className="popover-topline">
            <span className="popover-heading">Song setup</span>
            <button className="icon-button mini" onClick={() => setOpen(false)} aria-label="Close">
              <X size={13} />
            </button>
          </div>
          <div className="song-tempo-row">
            <div>
              <div className="field-label">Tempo</div>
              <div className="tempo-display">
                <span>{project.bpm}</span>
                <em>BPM</em>
              </div>
            </div>
            <div className="tempo-buttons">
              <button className="stepper" onClick={() => nudgeBpm(-1)} aria-label="Decrease tempo">
                −
              </button>
              <input
                className="tempo-input"
                value={bpmDraft}
                inputMode="numeric"
                onChange={(event) => setBpmDraft(event.target.value)}
                onBlur={() => commitBpm(bpmDraft)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.currentTarget.blur()
                  }
                }}
                aria-label="Tempo in BPM"
              />
              <button className="stepper" onClick={() => nudgeBpm(1)} aria-label="Increase tempo">
                +
              </button>
            </div>
          </div>
          <div className="song-field">
            <div className="field-label">Key</div>
            <div className="key-grid">
              {SONG_KEYS.map((key) => (
                <button
                  key={key}
                  className={`key-choice ${project.key === key ? 'is-selected' : ''}`}
                  onClick={() => updateProject({ key })}
                >
                  {key}
                </button>
              ))}
            </div>
          </div>
          <div className="song-row">
            <div className="song-field grow">
              <div className="field-label">Mode</div>
              <div className="segmented">
                {(['minor', 'major'] as const).map((scale) => (
                  <button
                    key={scale}
                    className={project.scale === scale ? 'is-selected' : ''}
                    onClick={() => updateProject({ scale })}
                  >
                    {scale === 'minor' ? 'Minor' : 'Major'}
                  </button>
                ))}
              </div>
            </div>
            <div className="song-field">
              <div className="field-label">Meter</div>
              <div className="segmented">
                {[4, 3].map((sig) => (
                  <button
                    key={sig}
                    className={project.timeSig === sig ? 'is-selected' : ''}
                    onClick={() => updateProject({ timeSig: sig })}
                  >
                    {sig}/4
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="swing-panel">
            <div className="swing-head">
              <div>
                <div className="field-label">Swing</div>
                <span className={`swing-state ${swing.enabled ? 'is-on' : ''}`}>
                  {swing.enabled
                    ? `${swing.division}th-note swing`
                    : 'Straight time'}
                </span>
              </div>
              <button
                className={`swing-switch ${swing.enabled ? 'is-on' : ''}`}
                role="switch"
                aria-checked={swing.enabled}
                aria-label="Enable swing"
                onClick={() =>
                  updateSwing({
                    enabled: !swing.enabled,
                    amount: !swing.enabled && swing.amount === 0 ? 50 : swing.amount,
                  })
                }
              >
                <span />
              </button>
            </div>
            <div className="swing-slider-row">
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={swing.amount}
                disabled={!swing.enabled}
                onChange={(event) =>
                  updateSwing({ amount: Number(event.target.value) }, 'swing-amount')
                }
                aria-label="Swing amount"
                aria-valuetext={`${Math.round(swing.amount)} percent`}
                style={{ ['--swing-progress' as string]: `${swing.amount}%` }}
              />
              <strong>{Math.round(swing.amount)}%</strong>
            </div>
            <div className="swing-division-row">
              <div className="segmented">
                {([8, 16] as const).map((division) => (
                  <button
                    key={division}
                    className={swing.division === division ? 'is-selected' : ''}
                    aria-pressed={swing.division === division}
                    onClick={() => updateSwing({ division })}
                  >
                    {division}th
                  </button>
                ))}
              </div>
              <span>0% straight · 100% triplet</span>
            </div>
            <p className="swing-note">
              Delays every second {swing.division}th note. Applied to playback
              and WAV exports.
            </p>
          </div>
          <p className="popover-note">Tempo changes while playing restart the transport, so everything stays in time.</p>
        </div>
      )}
    </div>
  )
}

export function TopBar() {
  const project = useProjectStore((state) => state.project)
  const updateProject = useProjectStore((state) => state.updateProject)
  const undo = useProjectStore((state) => state.undo)
  const redo = useProjectStore((state) => state.redo)
  const canUndo = useProjectStore((state) => state.past.length > 0)
  const canRedo = useProjectStore((state) => state.future.length > 0)
  const isPlaying = useSessionStore((state) => state.isPlaying)
  const isRecording = useSessionStore((state) => state.isRecording)
  const metronome = useSessionStore((state) => state.metronome)
  const setModal = useSessionStore((state) => state.setModal)
  const saveStatus = useSessionStore((state) => state.saveStatus)
  const [nameFocused, setNameFocused] = useState(false)

  const handleRecord = async () => {
    await toggleRecording()
  }
  const loopStartBar = Math.floor(project.loop.start / project.timeSig) + 1
  const loopEndBar = Math.ceil(project.loop.end / project.timeSig)

  return (
    <header className="topbar">
      <div className="topbar-left">
        <Brand />
        <div className="project-identity">
          <div className="project-name-wrap">
            <input
              className={`project-name ${nameFocused ? 'is-focused' : ''}`}
              value={project.name}
              onChange={(event) => updateProject({ name: event.target.value }, { coalesce: 'project-name' })}
              onFocus={() => setNameFocused(true)}
              onBlur={() => {
                setNameFocused(false)
                if (!project.name.trim()) updateProject({ name: 'Untitled Song' }, { history: false })
              }}
              spellCheck={false}
              maxLength={48}
              aria-label="Project name"
              style={{ width: `${Math.max(72, project.name.length * 8.4 + 16)}px` }}
            />
            <ProjectMenu />
          </div>
          <div className="project-subline">
            <span>{project.tracks.length} tracks</span>
            <span className="subline-dot" />
            <span>Local session</span>
            {saveStatus === 'saving' && <span className="save-inline">Saving…</span>}
          </div>
        </div>
        <div className="history-controls">
          <button
            className="icon-button"
            onClick={undo}
            disabled={!canUndo}
            aria-label="Undo"
            data-tip={`Undo  ${MOD_LABEL}Z`}
          >
            <Undo2 size={16} />
          </button>
          <button
            className="icon-button"
            onClick={redo}
            disabled={!canRedo}
            aria-label="Redo"
            data-tip={`Redo  ${SHIFT_LABEL}${MOD_LABEL}Z`}
          >
            <Redo2 size={16} />
          </button>
        </div>
      </div>

      <div className="topbar-center">
        <div className="transport" aria-label="Transport controls">
          <button className="transport-button" onClick={rewindTransport} aria-label="Return to start" data-tip="Return to start">
            <SkipBack size={16} fill="currentColor" />
          </button>
          <button
            className={`transport-button record-button ${isRecording ? 'is-recording' : ''}`}
            onClick={() => void handleRecord()}
            aria-label={isRecording ? 'Stop recording' : 'Record'}
            data-tip={isRecording ? 'Stop recording' : 'Record  R'}
          >
            <Circle size={15} fill="currentColor" />
          </button>
          <button
            className={`play-button ${isPlaying ? 'is-playing' : ''}`}
            onClick={() => void (isPlaying ? pauseTransport() : playTransport())}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            data-tip={isPlaying ? 'Pause  Space' : 'Play  Space'}
          >
            {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={19} fill="currentColor" />}
          </button>
          <button className="transport-button stop-button" onClick={stopTransport} aria-label="Stop" data-tip="Stop">
            <Square size={12} fill="currentColor" />
          </button>
          <div className="transport-divider" />
          <button
            className={`transport-button ${project.loop.enabled ? 'is-on' : ''}`}
            onClick={toggleLoop}
            aria-label="Loop"
            aria-pressed={project.loop.enabled}
            data-tip={`Loop bars ${loopStartBar}–${loopEndBar}  ·  L`}
          >
            <Repeat2 size={16} />
          </button>
          <button
            className={`transport-button ${metronome ? 'is-on' : ''}`}
            onClick={toggleMetronome}
            aria-label="Metronome"
            aria-pressed={metronome}
            data-tip="Metronome"
          >
            <MetronomeIcon />
          </button>
        </div>

        <TransportReadout />
        <SongSettings />
      </div>

      <div className="topbar-right">
        <div className={`save-state ${saveStatus}`}>
          {saveStatus === 'saving' ? <Loader2 size={13} className="spin" /> : saveStatus === 'error' ? <Circle size={9} fill="currentColor" /> : <Check size={13} />}
          <span>{saveStatus === 'saving' ? 'Saving' : saveStatus === 'error' ? 'Not saved' : 'Saved'}</span>
        </div>
        <div className="topbar-action-divider" />
        <GuideButton />
        <button
          className="palette-trigger"
          onClick={() => setModal('palette')}
          aria-label="Search actions"
          data-tip={`Search every action  ${MOD_LABEL}K`}
        >
          <Search size={14} />
          <span className="palette-trigger-label">Search</span>
          <kbd>{MOD_LABEL}K</kbd>
        </button>
        <MidiControl />
        <button className="icon-button help-button" onClick={() => setModal('help')} aria-label="Help" data-tip="Help  ?">
          <HelpCircle size={17} />
        </button>
        <button className="export-button" onClick={() => setModal('export')} data-tip="Export song" aria-label="Export song">
          <Download size={15} />
          <span>Export</span>
        </button>
      </div>

    </header>
  )
}

function MetronomeIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M6.2 17h7.6L12.3 4.2a1 1 0 0 0-1-.86H8.7a1 1 0 0 0-1 .86L6.2 17Z" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" />
      <path d="M8 12.6l7.7-6.4" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      <path d="M5.8 14.6h8.4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" opacity="0.45" />
    </svg>
  )
}
