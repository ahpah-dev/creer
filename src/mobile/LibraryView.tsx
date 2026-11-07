import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Pause, Play, Plus, Sparkles } from 'lucide-react'
import { engine } from '../audio/engine'
import { LOOPS } from '../data/demo'
import { INSTRUMENT_MAP, isDrumInstrument } from '../data/instruments'
import { IDEA_STYLES, generateIdea, type IdeaPlacement, type IdeaStyleId } from '../lib/idea'
import { addLoopToProject } from '../lib/tracks'
import { getCurrentBeat, pauseTransport, playTransport, seekTo, syncEngineProject } from '../lib/transport'
import { transposeNotesToKey } from '../lib/utils'
import { useProjectStore } from '../store/project'
import { useSessionStore } from '../store/session'
import type { LoopDef } from '../types'
import { SoundBrowser } from './SoundBrowser'
import { useMobileStore, type LibraryPane } from './store'
import { Segmented } from './ui'

const PANES: { value: LibraryPane; label: string }[] = [
  { value: 'ideas', label: 'Ideas' },
  { value: 'loops', label: 'Loops' },
  { value: 'sounds', label: 'Sounds' },
]

function IdeasPane() {
  const project = useProjectStore((state) => state.project)
  const apply = useProjectStore((state) => state.apply)
  const selectClip = useProjectStore((state) => state.selectClip)
  const setTab = useMobileStore((state) => state.setTab)
  const toast = useSessionStore((state) => state.toast)
  const [styleId, setStyleId] = useState<IdeaStyleId>('lofi')
  const [bars, setBars] = useState(8)
  const [placement, setPlacement] = useState<IdeaPlacement>('end')
  const style = IDEA_STYLES.find((item) => item.id === styleId) ?? IDEA_STYLES[0]

  const generate = (play: boolean) => {
    if (useSessionStore.getState().isPlaying) pauseTransport()
    const result = generateIdea(project, { styleId, bars, placement, playhead: getCurrentBeat() })
    apply(() => result.project)
    syncEngineProject()
    seekTo(result.startBeat)
    useSessionStore.getState().setSelectedNoteIds([])
    if (result.focusTrackId && result.focusClipId) selectClip(result.focusTrackId, result.focusClipId)
    toast(`${style.label} idea ready`, `${result.summary} · Undo takes it back.`, 'success')
    setTab('tracks')
    if (play) window.setTimeout(() => void playTransport(), 80)
  }

  return (
    <div className="m-pane">
      <div className="m-pane-lede">
        <Sparkles size={18} />
        <p>Pick a feeling and Creer writes drums, bass, chords, texture and a melody into your song.</p>
      </div>
      <div className="m-idea-grid">
        {IDEA_STYLES.map((item) => (
          <button
            key={item.id}
            className={`m-idea ${item.id === styleId ? 'is-on' : ''}`}
            style={{ '--c': item.color } as CSSProperties}
            onClick={() => setStyleId(item.id)}
            aria-pressed={item.id === styleId}
          >
            <b>{item.label}</b>
            <small>{item.description}</small>
            <em>{item.bpm} BPM</em>
          </button>
        ))}
      </div>
      <div className="m-group">
        <h3>Length</h3>
        <Segmented
          label="Bars"
          value={bars}
          options={[
            { value: 4, label: '4 bars' },
            { value: 8, label: '8 bars' },
            { value: 16, label: '16 bars' },
          ]}
          onChange={setBars}
        />
        <h3>Where</h3>
        <Segmented
          label="Placement"
          value={placement}
          options={[
            { value: 'end', label: 'After song' },
            { value: 'playhead', label: 'At playhead' },
            { value: 'fresh', label: 'Fresh start' },
          ]}
          onChange={setPlacement}
        />
        {placement === 'fresh' && <p className="m-hint">A fresh start replaces the tracks and sets the tempo to {style.bpm} BPM. Undo restores them.</p>}
      </div>
      <div className="m-cta-row">
        <button className="m-btn m-btn-primary m-btn-big" onClick={() => generate(true)}>
          <Play size={18} fill="currentColor" /> Spark &amp; play
        </button>
        <button className="m-btn m-btn-big" onClick={() => generate(false)}>
          <Sparkles size={18} /> Spark
        </button>
      </div>
    </div>
  )
}

function LoopRow({ loop, projectKey, bpm }: { loop: LoopDef; projectKey: string; bpm: number }) {
  const previewingLoop = useSessionStore((state) => state.previewingLoop)
  const setPreviewingLoop = useSessionStore((state) => state.setPreviewingLoop)
  const setTab = useMobileStore((state) => state.setTab)
  const preview = previewingLoop === loop.id
  const info = INSTRUMENT_MAP[loop.instrument]
  const notes = useMemo(
    () => (isDrumInstrument(loop.instrument) ? loop.notes : transposeNotesToKey(loop.notes, 'A', projectKey)),
    [loop, projectKey],
  )
  const pitches = loop.notes.map((note) => note.pitch)
  const min = Math.min(...pitches)
  const span = Math.max(8, Math.max(...pitches) - min + 1)

  const toggle = async () => {
    if (preview) {
      engine.stopPreview()
      setPreviewingLoop(null)
      return
    }
    if (useSessionStore.getState().isPlaying) pauseTransport()
    setPreviewingLoop(loop.id)
    await engine.previewNotes(loop.instrument, notes, bpm, loop.lengthBeats, () => {
      if (useSessionStore.getState().previewingLoop === loop.id) useSessionStore.getState().setPreviewingLoop(null)
    })
  }

  return (
    <article className={`m-loop ${preview ? 'is-on' : ''}`} style={{ '--c': loop.color } as CSSProperties}>
      <button className="m-loop-play" onClick={() => void toggle()} aria-label={preview ? `Stop ${loop.name}` : `Preview ${loop.name}`}>
        {preview ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
      </button>
      <div className="m-loop-text">
        <b>{loop.name}</b>
        <small>
          {info.shortName} · {loop.category} · {Math.round(loop.lengthBeats / 4)} bars
        </small>
        <svg viewBox={`0 0 ${loop.lengthBeats} ${span}`} preserveAspectRatio="none" aria-hidden="true">
          {loop.notes.slice(0, 64).map((note, index) => (
            <rect
              key={index}
              x={note.start}
              y={span - (note.pitch - min) - 1}
              width={Math.max(0.1, note.duration)}
              height={0.8}
              opacity={0.35 + note.velocity * 0.6}
            />
          ))}
        </svg>
      </div>
      <button
        className="m-btn m-loop-add"
        onClick={() => {
          engine.stopPreview()
          setPreviewingLoop(null)
          addLoopToProject(loop)
          setTab('tracks')
        }}
        aria-label={`Add ${loop.name} to the song`}
      >
        <Plus size={16} /> Add
      </button>
    </article>
  )
}

const CATEGORIES = ['All', 'Beats', 'Bass', 'Chords', 'Melody', 'Texture'] as const

function LoopsPane() {
  const project = useProjectStore((state) => state.project)
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('All')
  useEffect(() => () => engine.stopPreview(), [])
  const loops = LOOPS.filter((loop) => category === 'All' || loop.category === category)
  return (
    <div className="m-pane">
      <div className="m-chips" role="group" aria-label="Loop categories">
        {CATEGORIES.map((item) => (
          <button key={item} className={category === item ? 'is-on' : ''} onClick={() => setCategory(item)}>
            {item}
          </button>
        ))}
      </div>
      <div className="m-loop-list">
        {loops.map((loop) => (
          <LoopRow key={loop.id} loop={loop} projectKey={project.key} bpm={project.bpm} />
        ))}
      </div>
    </div>
  )
}

export function LibraryView() {
  const pane = useMobileStore((state) => state.libraryPane)
  const setPane = useMobileStore((state) => state.setLibraryPane)
  const setTab = useMobileStore((state) => state.setTab)
  return (
    <div className="m-library">
      <div className="m-library-head">
        <Segmented value={pane} options={PANES} onChange={setPane} label="Library section" />
      </div>
      <div className="m-library-body">
        {pane === 'ideas' && <IdeasPane />}
        {pane === 'loops' && <LoopsPane />}
        {pane === 'sounds' && <SoundBrowser onDone={() => setTab('play')} />}
      </div>
    </div>
  )
}
