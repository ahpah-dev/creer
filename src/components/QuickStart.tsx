import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ArrowRight, Check, Compass, Library, Plus, Sparkles, X } from 'lucide-react'
import type { InstrumentId } from '../types'
import { INSTRUMENT_MAP } from '../data/instruments'
import { useProjectStore } from '../store/project'
import { useSessionStore } from '../store/session'
import { editSelection } from '../lib/commands'
import { MOD_LABEL } from '../lib/utils'
import { addTrackWithStarterClip } from '../lib/tracks'
import { togglePlayback } from '../lib/transport'
import { TrackIcon } from './TrackIcon'

interface GuideStep {
  id: string
  title: string
  detail: string
  action: string
  done: boolean
  run: () => void
}

function useGuideSteps(): GuideStep[] {
  const project = useProjectStore((state) => state.project)
  const progress = useSessionStore((state) => state.progress)
  const setModal = useSessionStore((state) => state.setModal)
  const setDock = useSessionStore((state) => state.setDock)
  const hasNotes = project.tracks.some((track) => track.clips.some((clip) => clip.notes.length > 0))
  return [
    {
      id: 'sound',
      title: 'Pick a sound',
      detail: 'Every track is one instrument. Start with drums, bass or keys.',
      action: 'Add a track',
      done: project.tracks.length > 0,
      run: () => setModal('addTrack'),
    },
    {
      id: 'notes',
      title: 'Write a few notes',
      detail: 'Click in the piano roll to draw notes. Drag to move, Delete to remove.',
      action: 'Open piano roll',
      done: hasNotes,
      run: editSelection,
    },
    {
      id: 'play',
      title: 'Hear it back',
      detail: 'Press Space any time. Loop a section with L to keep working on it.',
      action: 'Play',
      done: progress.played,
      run: () => void togglePlayback(),
    },
    {
      id: 'shape',
      title: 'Shape the sound',
      detail: 'Balance levels in the mixer, then add reverb, delay or filters.',
      action: 'Open mixer',
      done: progress.shaped,
      run: () => setDock('mixer'),
    },
    {
      id: 'export',
      title: 'Share your song',
      detail: 'Export a WAV file you can send to anyone.',
      action: 'Export',
      done: progress.exported,
      run: () => setModal('export'),
    },
  ]
}

export function GuideButton() {
  const steps = useGuideSteps()
  const dismissed = useSessionStore((state) => state.guideDismissed)
  const setDismissed = useSessionStore((state) => state.setGuideDismissed)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const done = steps.filter((step) => step.done).length
  const complete = done === steps.length

  useEffect(() => {
    const openGuide = () => setOpen(true)
    window.addEventListener('creer:open-guide', openGuide)
    return () => window.removeEventListener('creer:open-guide', openGuide)
  }, [])

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  if ((dismissed || complete) && !open) return null

  const next = steps.find((step) => !step.done)
  const ring = (done / steps.length) * 100

  return (
    <div className="guide-wrap" ref={ref}>
      <button
        className={`guide-button ${open ? 'is-active' : ''}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={`Quick start guide, ${done} of ${steps.length} done`}
      >
        <span className="guide-ring" style={{ ['--guide-progress' as string]: `${ring}%` } as CSSProperties}>
          <Compass size={12} />
        </span>
        <span className="guide-button-label">Guide</span>
        <span className="guide-count">
          {done}/{steps.length}
        </span>
      </button>
      {open && (
        <div className="popover guide-popover" role="dialog" aria-label="Quick start">
          <div className="guide-head">
            <div>
              <span className="eyebrow">QUICK START</span>
              <h3>{complete ? 'You made a song.' : 'Make a song in five steps'}</h3>
            </div>
            <button className="icon-button mini" onClick={() => setOpen(false)} aria-label="Close guide">
              <X size={13} />
            </button>
          </div>
          <ol className="guide-steps">
            {steps.map((step, index) => (
              <li key={step.id} className={`guide-step ${step.done ? 'is-done' : ''} ${next?.id === step.id ? 'is-next' : ''}`}>
                <span className="guide-step-mark">{step.done ? <Check size={11} strokeWidth={3} /> : index + 1}</span>
                <div className="guide-step-copy">
                  <strong>{step.title}</strong>
                  <p>{step.detail}</p>
                </div>
                <button
                  className="guide-step-action"
                  onClick={() => {
                    setOpen(false)
                    step.run()
                  }}
                >
                  {step.action}
                  <ArrowRight size={11} />
                </button>
              </li>
            ))}
          </ol>
          <div className="guide-foot">
            <span>
              Press <kbd>{MOD_LABEL}K</kbd> to search every action.
            </span>
            <button
              className="guide-hide"
              onClick={() => {
                setDismissed(true)
                setOpen(false)
              }}
            >
              Hide guide
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Shown over an arrangement that has no clips yet, so a blank page is never the first impression. */
export function StartPanel() {
  const setModal = useSessionStore((state) => state.setModal)
  const setDock = useSessionStore((state) => state.setDock)
  const resetToDemo = useProjectStore((state) => state.resetToDemo)

  return (
    <div className="start-panel" role="region" aria-label="Get started">
      <div className="start-card">
        <span className="eyebrow">BLANK SESSION</span>
        <h2>Where do you want to start?</h2>
        <p>Pick a way in — everything can be changed later, and Undo has your back.</p>
        <div className="start-options">
          <button className="start-option is-primary" onClick={() => setModal('idea')}>
            <span className="start-option-icon">
              <Sparkles size={18} />
            </span>
            <span>
              <strong>Spark an idea</strong>
              <em>Generate drums, bass and chords for a whole section in one click.</em>
            </span>
          </button>
          <button className="start-option" onClick={() => setModal('addTrack')}>
            <span className="start-option-icon">
              <Plus size={18} />
            </span>
            <span>
              <strong>Start with a sound</strong>
              <em>Choose an instrument and draw notes in the piano roll.</em>
            </span>
          </button>
          <button className="start-option" onClick={() => setDock('loops')}>
            <span className="start-option-icon">
              <Library size={18} />
            </span>
            <span>
              <strong>Drop in a loop</strong>
              <em>Browse ready-made beats, basslines and chords.</em>
            </span>
          </button>
        </div>
        <div className="start-foot">
          <span>
            Or double-click any lane to make an empty clip · press <kbd>{MOD_LABEL}K</kbd> to search every action
          </span>
          <button className="start-link" onClick={resetToDemo}>
            Load the demo song instead
          </button>
        </div>
      </div>
    </div>
  )
}

const QUICK_SOUNDS: { instrument: InstrumentId; label: string }[] = [
  { instrument: 'drums', label: 'Drums' },
  { instrument: 'bass', label: 'Bass' },
  { instrument: 'piano', label: 'Keys' },
  { instrument: 'pad', label: 'Pad' },
  { instrument: 'pluck', label: 'Lead' },
  { instrument: 'bell', label: 'Bells' },
]

/** One-click sounds under the track list: the fastest way to build up a song. */
export function QuickAddTracks() {
  const setModal = useSessionStore((state) => state.setModal)
  return (
    <div className="quick-add">
      <div className="quick-add-head">
        <span>ADD A SOUND</span>
        <button onClick={() => setModal('addTrack')}>All sounds…</button>
      </div>
      <div className="quick-add-grid">
        {QUICK_SOUNDS.map(({ instrument, label }) => (
          <button
            key={instrument}
            className="quick-add-chip"
            style={{ ['--chip-color' as string]: INSTRUMENT_MAP[instrument].color } as CSSProperties}
            onClick={() => addTrackWithStarterClip(instrument)}
            data-tip={`Add ${INSTRUMENT_MAP[instrument].name} track`}
          >
            <TrackIcon instrument={instrument} size={13} />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
