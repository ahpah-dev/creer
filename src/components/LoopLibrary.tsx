import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Pause, Play, Plus, Search, SlidersHorizontal } from 'lucide-react'
import { LOOPS } from '../data/demo'
import { engine } from '../audio/engine'
import { useProjectStore } from '../store/project'
import { useSessionStore } from '../store/session'
import { addLoopToProject } from '../lib/tracks'
import { INSTRUMENT_MAP, isDrumInstrument } from '../data/instruments'
import { transposeNotesToKey } from '../lib/utils'
import type { LoopDef } from '../types'

const CATEGORIES = ['All', 'Beats', 'Bass', 'Chords', 'Melody', 'Texture'] as const

function LoopPattern({ loop }: { loop: LoopDef }) {
  const pitches = loop.notes.map((note) => note.pitch)
  const min = Math.min(...pitches, 48)
  const max = Math.max(...pitches, 72)
  const span = Math.max(8, max - min + 1)
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="loop-mini" aria-hidden="true">
      {loop.notes.slice(0, 48).map((note, index) => (
        <rect
          key={index}
          x={(note.start / loop.lengthBeats) * 100}
          y={30 - ((note.pitch - min) / span) * 26}
          width={Math.max(0.8, (note.duration / loop.lengthBeats) * 100)}
          height="2"
          rx="0.7"
          fill={loop.color}
          opacity={0.3 + note.velocity * 0.45}
        />
      ))}
    </svg>
  )
}

function LoopCard({ loop, projectKey, bpm }: { loop: LoopDef; projectKey: string; bpm: number }) {
  const previewingLoop = useSessionStore((state) => state.previewingLoop)
  const setPreviewingLoop = useSessionStore((state) => state.setPreviewingLoop)
  const isPreviewing = previewingLoop === loop.id
  const info = INSTRUMENT_MAP[loop.instrument]
  const previewNotes = useMemo(
    () => (isDrumInstrument(loop.instrument) ? loop.notes : transposeNotesToKey(loop.notes, 'A', projectKey)),
    [loop, projectKey],
  )

  const togglePreview = async () => {
    if (isPreviewing) {
      engine.stopPreview()
      setPreviewingLoop(null)
      return
    }
    setPreviewingLoop(loop.id)
    await engine.previewNotes(loop.instrument, previewNotes, bpm, loop.lengthBeats, () => {
      if (useSessionStore.getState().previewingLoop === loop.id) {
        useSessionStore.getState().setPreviewingLoop(null)
      }
    })
  }

  const add = () => {
    engine.stopPreview()
    setPreviewingLoop(null)
    addLoopToProject(loop)
  }

  return (
    <article className={`loop-card ${isPreviewing ? 'is-previewing' : ''}`} style={{ '--loop-color': loop.color } as CSSProperties}>
      <div className="loop-card-top">
        <span className="loop-category">
          {loop.category} · {Math.round(loop.lengthBeats / 4)} bars
        </span>
        <button
          className={`loop-preview-toggle ${isPreviewing ? 'is-playing' : ''}`}
          onClick={() => void togglePreview()}
          aria-label={isPreviewing ? `Stop preview of ${loop.name}` : `Preview ${loop.name}`}
          title={isPreviewing ? 'Stop preview' : 'Preview loop'}
        >
          {isPreviewing ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
        </button>
      </div>
      <div className="loop-card-main">
        <div className="loop-title-line">
          <strong>{loop.name}</strong>
          <span className="loop-instrument">{info.shortName}</span>
        </div>
        <p>{loop.description}</p>
      </div>
      <div className="loop-pattern-wrap">
        <LoopPattern loop={loop} />
      </div>
      <div className="loop-card-footer">
        <div className="loop-tags">
          {loop.tags.slice(0, 2).map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        <button className="loop-add" onClick={add} aria-label={`Add ${loop.name} to song`}>
          <Plus size={12} />
          Add
        </button>
      </div>
    </article>
  )
}

export function LoopLibrary() {
  const project = useProjectStore((state) => state.project)
  const isPlaying = useSessionStore((state) => state.isPlaying)
  const previewingLoop = useSessionStore((state) => state.previewingLoop)
  const setPreviewingLoop = useSessionStore((state) => state.setPreviewingLoop)
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('All')
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isPlaying || !previewingLoop) return
    engine.stopPreview()
    setPreviewingLoop(null)
  }, [isPlaying, previewingLoop, setPreviewingLoop])

  useEffect(() => {
    return () => {
      engine.stopPreview()
      useSessionStore.getState().setPreviewingLoop(null)
    }
  }, [])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return LOOPS.filter((loop) => {
      if (category !== 'All' && loop.category !== category) return false
      if (!query) return true
      const haystack = `${loop.name} ${loop.description} ${loop.tags.join(' ')}`.toLowerCase()
      return haystack.includes(query)
    })
  }, [category, search])

  return (
    <div className="library">
      <div className="library-toolbar">
        <div className="library-heading">
          <span className="eyebrow">CURATED LOOPS</span>
          <strong>
            {project.key} {project.scale === 'minor' ? 'minor' : 'major'} · {project.bpm} BPM
          </strong>
        </div>
        <div className="library-filters">
          {CATEGORIES.map((item) => (
            <button
              key={item}
              className={`filter-chip ${category === item ? 'is-active' : ''}`}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <label className="library-search">
          <Search size={13} />
          <input
            ref={searchRef}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search loops"
            aria-label="Search loops"
          />
          <kbd>/</kbd>
        </label>
        <span className="library-count">
          <SlidersHorizontal size={12} />
          {filtered.length} sounds
        </span>
      </div>
      <div className="library-scroll">
        {filtered.length ? (
          <div className="library-grid">
            {filtered.map((loop) => (
              <LoopCard
                key={loop.id}
                loop={loop}
                projectKey={project.key}
                bpm={project.bpm}
              />
            ))}
          </div>
        ) : (
          <div className="library-empty">
            <span>No loops found</span>
            <p>Try a different search or category. New sounds are added all the time.</p>
            <button
              className="button button-secondary"
              onClick={() => {
                setSearch('')
                setCategory('All')
              }}
            >
              Clear filters
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
