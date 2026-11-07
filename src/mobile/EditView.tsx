import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { ArrowDown, ArrowUp, Copy, Minus, Plus, Trash2, ZoomIn, ZoomOut } from 'lucide-react'
import { engine } from '../audio/engine'
import { DRUM_NOTES, INSTRUMENT_MAP, isDrumInstrument } from '../data/instruments'
import { getSelectedClip, useProjectStore } from '../store/project'
import { useSessionStore } from '../store/session'
import { addClipOnTrack, quantizeNotes } from '../lib/clips'
import { clamp, isBlackKey, midiToName, NOTE_LENGTH_OPTIONS, uid } from '../lib/utils'
import type { Note } from '../types'
import { TrackIcon } from '../components/TrackIcon'
import { EDIT_ZOOM, useMobileStore } from './store'
import { Slider } from './ui'

const KEYS_W = 54
const RULER_H = 28
const PITCH_LO = 24
const PITCH_HI = 96

type NoteDrag = {
  id: string
  mode: 'move' | 'resize'
  pointerId: number
  startX: number
  startY: number
  moved: boolean
  start: number
  duration: number
  pitch: number
}

const GRID_OPTIONS = NOTE_LENGTH_OPTIONS.map((option) => ({ ...option, label: option.label === '1 bar' ? '1 bar' : option.label }))

export function EditView() {
  const project = useProjectStore((state) => state.project)
  const selectedClipId = useProjectStore((state) => state.selectedClipId)
  const selectedTrackId = useProjectStore((state) => state.selectedTrackId)
  const updateNotes = useProjectStore((state) => state.updateNotes)
  const updateClip = useProjectStore((state) => state.updateClip)
  const ppb = useMobileStore((state) => state.editZoom)
  const setZoom = useMobileStore((state) => state.setEditZoom)
  const grid = useMobileStore((state) => state.grid)
  const setGrid = useMobileStore((state) => state.setGrid)
  const selectedNoteId = useMobileStore((state) => state.selectedNoteId)
  const setSelectedNoteId = useMobileStore((state) => state.setSelectedNoteId)
  const setTab = useMobileStore((state) => state.setTab)
  const toast = useSessionStore((state) => state.toast)
  const selection = getSelectedClip(project, selectedClipId)
  const scrollRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const playheadRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<NoteDrag | null>(null)
  const dragRef = useRef<NoteDrag | null>(null)
  const lastLength = useRef(grid)
  const suppressClick = useRef(false)

  const track = selection?.track
  const clip = selection?.clip
  const drums = track ? isDrumInstrument(track.instrument) : false
  const timeSig = project.timeSig

  const rows = useMemo(() => {
    if (drums) return [...DRUM_NOTES].reverse().map((drum) => ({ pitch: drum.pitch, label: drum.name, black: false }))
    const list: { pitch: number; label: string; black: boolean }[] = []
    for (let pitch = PITCH_HI; pitch >= PITCH_LO; pitch--) {
      list.push({ pitch, label: pitch % 12 === 0 ? midiToName(pitch) : '', black: isBlackKey(pitch) })
    }
    return list
  }, [drums])
  const rowH = drums ? 38 : 28
  const rowIndexOf = (pitch: number) => {
    const index = rows.findIndex((row) => row.pitch === pitch)
    if (index >= 0) return index
    return clamp(rows.length - 1 - (pitch - rows[rows.length - 1].pitch), 0, rows.length - 1)
  }

  // Land the view on the music: scroll to the clip's notes when a clip opens.
  useLayoutEffect(() => {
    const scroller = scrollRef.current
    if (!scroller || !clip) return
    const pitches = clip.notes.map((note) => note.pitch)
    const centerPitch = pitches.length ? (Math.min(...pitches) + Math.max(...pitches)) / 2 : drums ? 40 : 62
    const index = rowIndexOf(Math.round(centerPitch))
    scroller.scrollTop = Math.max(0, RULER_H + index * rowH - scroller.clientHeight / 2)
    scroller.scrollLeft = 0
    lastLength.current = grid
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip?.id, drums])

  // Playhead inside the open clip.
  useEffect(() => {
    if (!clip) return
    let frame = 0
    const loop = () => {
      const session = useSessionStore.getState()
      const beat = (session.isPlaying ? engine.getPosition() : session.pausedBeat) - clip.start
      const el = playheadRef.current
      if (el) {
        const visible = beat >= 0 && beat <= clip.length
        el.style.opacity = visible ? '1' : '0'
        el.style.transform = `translate3d(${beat * ppb}px,0,0)`
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [clip, ppb])

  useEffect(() => {
    setSelectedNoteId(null)
  }, [clip?.id, setSelectedNoteId])

  if (!clip || !track) {
    const target = project.tracks.find((item) => item.id === selectedTrackId) ?? project.tracks[0]
    return (
      <div className="m-empty">
        <h2>Pick a region to edit</h2>
        <p>Select a region in Tracks, then come back to draw and shape its notes.</p>
        <div className="m-empty-actions">
          <button className="m-btn m-btn-primary" onClick={() => setTab('tracks')}>
            Go to Tracks
          </button>
          {target && (
            <button
              className="m-btn"
              onClick={() => {
                addClipOnTrack(target.id, undefined, 2)
              }}
            >
              <Plus size={16} /> New region on {target.name}
            </button>
          )}
        </div>
      </div>
    )
  }

  const info = INSTRUMENT_MAP[track.instrument]
  const clipW = clip.length * ppb
  const selectedNote = clip.notes.find((note) => note.id === selectedNoteId) ?? null

  const audition = (pitch: number, velocity = 0.8) => {
    void engine.noteOn(track.instrument, track.id, pitch, velocity).then((key) => window.setTimeout(() => engine.noteOff(key), drums ? 400 : 380))
  }

  const commit = (notes: Note[], coalesce?: string) =>
    updateNotes(track.id, clip.id, notes, coalesce ? { coalesce: `${coalesce}:${clip.id}` } : undefined)

  const onGridClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = gridRef.current?.getBoundingClientRect()
    if (!rect) return
    const beat = (event.clientX - rect.left) / ppb
    const row = Math.floor((event.clientY - rect.top) / rowH)
    if (row < 0 || row >= rows.length || beat < 0 || beat >= clip.length) return
    const start = Math.floor(beat / grid + 1e-6) * grid
    const duration = Math.max(0.0625, Math.min(lastLength.current, clip.length - start))
    const note: Note = {
      id: uid('n'),
      pitch: rows[row].pitch,
      start: Number(start.toFixed(4)),
      duration: Number(duration.toFixed(4)),
      velocity: 0.8,
    }
    commit([...clip.notes, note])
    setSelectedNoteId(note.id)
    audition(note.pitch, note.velocity)
  }

  const beginDrag = (event: React.PointerEvent, note: Note, mode: 'move' | 'resize') => {
    if (note.id !== selectedNoteId) return
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const next: NoteDrag = {
      id: note.id,
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      start: note.start,
      duration: note.duration,
      pitch: note.pitch,
    }
    dragRef.current = next
    setDrag(next)
  }

  const moveDrag = (event: React.PointerEvent, note: Note) => {
    const current = dragRef.current
    if (!current || current.pointerId !== event.pointerId || current.id !== note.id) return
    const dx = event.clientX - current.startX
    const dy = event.clientY - current.startY
    const moved = current.moved || Math.abs(dx) > 4 || Math.abs(dy) > 4
    let next: NoteDrag
    if (current.mode === 'resize') {
      const end = Math.round((note.start + note.duration + dx / ppb) / grid) * grid
      const duration = clamp(end - note.start, grid, clip.length - note.start)
      next = { ...current, moved, duration }
    } else {
      const start = clamp(Math.round((note.start + dx / ppb) / grid) * grid, 0, Math.max(0, clip.length - Math.min(note.duration, grid)))
      const fromRow = rowIndexOf(note.pitch)
      const row = clamp(fromRow + Math.round(dy / rowH), 0, rows.length - 1)
      next = { ...current, moved, start, pitch: rows[row].pitch }
      if (next.pitch !== current.pitch) audition(next.pitch, note.velocity)
    }
    dragRef.current = next
    setDrag(next)
  }

  const endDrag = (event: React.PointerEvent, note: Note) => {
    const current = dragRef.current
    if (!current || current.pointerId !== event.pointerId || current.id !== note.id) return
    dragRef.current = null
    setDrag(null)
    if (!current.moved) return
    suppressClick.current = true
    window.setTimeout(() => {
      suppressClick.current = false
    }, 60)
    if (current.mode === 'resize') {
      lastLength.current = current.duration
      commit(clip.notes.map((item) => (item.id === note.id ? { ...item, duration: Number(current.duration.toFixed(4)) } : item)), 'note-resize')
    } else {
      commit(
        clip.notes.map((item) =>
          item.id === note.id ? { ...item, start: Number(current.start.toFixed(4)), pitch: current.pitch } : item,
        ),
        'note-move',
      )
    }
  }

  const deleteSelected = () => {
    if (!selectedNote) return
    commit(clip.notes.filter((note) => note.id !== selectedNote.id))
    setSelectedNoteId(null)
  }

  const duplicateSelected = () => {
    if (!selectedNote) return
    const start = selectedNote.start + selectedNote.duration
    const room = start + selectedNote.duration <= clip.length + 1e-6
    const copy: Note = {
      ...selectedNote,
      id: uid('n'),
      start: room ? start : Math.max(0, clip.length - selectedNote.duration),
    }
    commit([...clip.notes, copy])
    setSelectedNoteId(copy.id)
    audition(copy.pitch, copy.velocity)
  }

  const transposeAll = (semitones: number) => {
    commit(clip.notes.map((note) => ({ ...note, pitch: clamp(note.pitch + semitones, 0, 127) })))
    toast(semitones > 0 ? 'Up an octave' : 'Down an octave')
  }

  const resizeClip = (bars: number) => {
    const length = Math.max(timeSig, clip.length + bars * timeSig)
    updateClip(track.id, clip.id, { length })
  }

  const zoomBy = (factor: number) => {
    const scroller = scrollRef.current
    if (scroller) {
      const center = KEYS_W + (scroller.clientWidth - KEYS_W) / 2
      const anchor = (scroller.scrollLeft + center - KEYS_W) / ppb
      const next = clamp(ppb * factor, EDIT_ZOOM.min, EDIT_ZOOM.max)
      requestAnimationFrame(() => {
        scroller.scrollLeft = anchor * next + KEYS_W - center
      })
    }
    setZoom(ppb * factor)
  }

  const barStart = Math.floor(clip.start / timeSig)
  const barCount = Math.ceil(clip.length / timeSig)

  return (
    <div className="m-edit" style={{ '--c': track.color } as CSSProperties}>
      <div className="m-edit-head">
        <span className="m-edit-icon">
          <TrackIcon instrument={track.instrument} size={16} />
        </span>
        <label className="m-edit-name">
          <input
            value={clip.name}
            maxLength={40}
            onChange={(event) => updateClip(track.id, clip.id, { name: event.target.value }, { coalesce: `clipname:${clip.id}` })}
            aria-label="Region name"
            enterKeyHint="done"
          />
          <small>
            {track.name} · {info.shortName}
          </small>
        </label>
        <div className="m-mini-stepper" role="group" aria-label="Region length">
          <button onClick={() => resizeClip(-1)} disabled={clip.length <= timeSig} aria-label="Shorter by a bar">
            <Minus size={15} />
          </button>
          <span>{Math.round((clip.length / timeSig) * 10) / 10} bars</span>
          <button onClick={() => resizeClip(1)} aria-label="Longer by a bar">
            <Plus size={15} />
          </button>
        </div>
        <button className="m-icon-btn m-small" onClick={() => zoomBy(1 / 1.3)} disabled={ppb <= EDIT_ZOOM.min} aria-label="Zoom out">
          <ZoomOut size={18} />
        </button>
        <button className="m-icon-btn m-small" onClick={() => zoomBy(1.3)} disabled={ppb >= EDIT_ZOOM.max} aria-label="Zoom in">
          <ZoomIn size={18} />
        </button>
      </div>

      <div className="m-roll" ref={scrollRef}>
        <div className="m-roll-inner" style={{ width: KEYS_W + clipW, height: RULER_H + rows.length * rowH }}>
          <div className="m-roll-ruler" style={{ height: RULER_H }}>
            <div className="m-roll-corner" style={{ width: KEYS_W }} />
            <div className="m-roll-scale" style={{ width: clipW }}>
              {Array.from({ length: barCount }, (_, bar) => (
                <b key={bar} style={{ left: bar * timeSig * ppb }}>
                  {barStart + bar + 1}
                </b>
              ))}
            </div>
          </div>
          <div className="m-roll-body" style={{ height: rows.length * rowH }}>
            <div className="m-roll-keys" style={{ width: KEYS_W }}>
              {rows.map((row) => (
                <button
                  key={row.pitch}
                  className={`m-rkey ${row.black ? 'is-black' : ''} ${drums ? 'is-drum' : ''}`}
                  style={{ height: rowH }}
                  onPointerDown={(event) => {
                    event.preventDefault()
                    audition(row.pitch)
                  }}
                  aria-label={drums ? row.label : midiToName(row.pitch)}
                >
                  {row.label}
                </button>
              ))}
            </div>
            <div
              className="m-roll-grid"
              ref={gridRef}
              style={
                {
                  width: clipW,
                  '--beat-w': `${ppb}px`,
                  '--bar-w': `${ppb * timeSig}px`,
                  '--grid-w': `${ppb * grid}px`,
                  '--row-h': `${rowH}px`,
                } as CSSProperties
              }
              onClick={onGridClick}
            >
              {rows.map((row, index) => (
                <i
                  key={row.pitch}
                  className={`m-grow ${row.black ? 'is-black' : ''} ${!drums && row.pitch % 12 === 0 ? 'is-c' : ''}`}
                  style={{ top: index * rowH, height: rowH }}
                />
              ))}
              {clip.notes.map((note) => {
                const active = drag && drag.id === note.id ? drag : null
                const start = active ? active.start : note.start
                const duration = active ? active.duration : note.duration
                const pitch = active ? active.pitch : note.pitch
                const selected = note.id === selectedNoteId
                return (
                  <div
                    key={note.id}
                    className={`m-note ${selected ? 'is-selected' : ''} ${active ? 'is-dragging' : ''}`}
                    style={{
                      left: start * ppb,
                      top: rowIndexOf(pitch) * rowH + 1,
                      width: Math.max(10, duration * ppb - 1),
                      height: rowH - 2,
                      opacity: selected ? 1 : 0.72 + note.velocity * 0.28,
                    }}
                    onClick={(event) => {
                      event.stopPropagation()
                      if (suppressClick.current) return
                      if (selected) {
                        setSelectedNoteId(null)
                      } else {
                        setSelectedNoteId(note.id)
                        audition(note.pitch, note.velocity)
                      }
                    }}
                    onPointerDown={(event) => beginDrag(event, note, 'move')}
                    onPointerMove={(event) => moveDrag(event, note)}
                    onPointerUp={(event) => endDrag(event, note)}
                    onPointerCancel={(event) => endDrag(event, note)}
                  >
                    {selected && (
                      <i
                        className="m-note-grip"
                        style={{ width: Math.min(24, Math.max(12, duration * ppb * 0.42)) }}
                        onPointerDown={(event) => beginDrag(event, note, 'resize')}
                        onPointerMove={(event) => moveDrag(event, note)}
                        onPointerUp={(event) => endDrag(event, note)}
                        onPointerCancel={(event) => endDrag(event, note)}
                      />
                    )}
                  </div>
                )
              })}
              <div className="m-roll-playhead" ref={playheadRef} />
            </div>
          </div>
        </div>
      </div>

      <div className="m-edit-bar">
        <div className="m-chips m-grid-chips" role="group" aria-label="Grid and note length">
          <span className="m-chips-label">Grid</span>
          {GRID_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={grid === option.value ? 'is-on' : ''}
              onClick={() => {
                setGrid(option.value)
                lastLength.current = option.value
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
        {!selectedNote && !clip.notes.length && <p className="m-hint">Tap the grid to draw your first note.</p>}
        {selectedNote ? (
          <div className="m-note-tools">
            <Slider
              label="Velocity"
              value={selectedNote.velocity}
              min={0.05}
              max={1}
              format={(v) => `${Math.round(v * 100)}`}
              onChange={(velocity) => commit(clip.notes.map((note) => (note.id === selectedNote.id ? { ...note, velocity } : note)), 'note-vel')}
            />
            <button className="m-tool" onClick={duplicateSelected}>
              <Copy size={17} />
              <span>Copy</span>
            </button>
            <button className="m-tool is-danger" onClick={deleteSelected}>
              <Trash2 size={17} />
              <span>Delete</span>
            </button>
          </div>
        ) : (
          <div className="m-note-tools">
            <button className="m-tool" onClick={() => commit(quantizeNotes(clip.notes, grid, clip.length))} disabled={!clip.notes.length}>
              <span>Quantize</span>
            </button>
            {!drums && (
              <>
                <button className="m-tool" onClick={() => transposeAll(12)} disabled={!clip.notes.length} aria-label="Up an octave">
                  <ArrowUp size={17} />
                  <span>Oct</span>
                </button>
                <button className="m-tool" onClick={() => transposeAll(-12)} disabled={!clip.notes.length} aria-label="Down an octave">
                  <ArrowDown size={17} />
                  <span>Oct</span>
                </button>
              </>
            )}
            <button
              className="m-tool is-danger"
              onClick={() => {
                commit([])
                toast('Region cleared', 'Undo brings the notes back.')
              }}
              disabled={!clip.notes.length}
            >
              <Trash2 size={17} />
              <span>Clear</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
