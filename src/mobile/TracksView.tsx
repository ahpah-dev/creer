import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  Copy,
  Ellipsis,
  Pencil,
  Plus,
  Repeat,
  Scissors,
  Timer,
  Trash2,
  ZoomIn,
  ZoomOut,
  Circle,
} from 'lucide-react'
import { engine } from '../audio/engine'
import { INSTRUMENT_MAP, isDrumInstrument } from '../data/instruments'
import { sectionColor } from '../data/sections'
import { useProjectStore } from '../store/project'
import { useSessionStore } from '../store/session'
import { addClipOnTrack, deleteSelectedClip, duplicateSelectedClip, splitSelectedClip } from '../lib/clips'
import { moveClipBetweenTracks } from '../lib/tracks'
import { seekTo, toggleLoop, toggleMetronome, toggleMute, toggleSolo } from '../lib/transport'
import { toggleRecording } from '../lib/recording'
import { clamp, projectEnd } from '../lib/utils'
import type { Clip, Project, Track } from '../types'
import { TrackIcon } from '../components/TrackIcon'
import { TRACK_ZOOM, useMobileStore } from './store'

export const HEADER_W = 116
const RULER_H = 36
const ROW_H = 76

const snapBeatTo = (value: number, step: number) => Math.round(value / step) * step

function ClipPreview({ clip, track }: { clip: Clip; track: Track }) {
  const drums = isDrumInstrument(track.instrument)
  const geometry = useMemo(() => {
    const notes = clip.notes.slice(0, 160)
    if (!notes.length) return null
    let min = Infinity
    let max = -Infinity
    for (const note of notes) {
      min = Math.min(min, note.pitch)
      max = Math.max(max, note.pitch)
    }
    const span = Math.max(drums ? 12 : 7, max - min + 1)
    return { notes, min, span }
  }, [clip.notes, drums])
  if (!geometry) return null
  return (
    <svg className="m-clip-notes" viewBox={`0 0 ${clip.length} ${geometry.span}`} preserveAspectRatio="none" aria-hidden="true">
      {geometry.notes.map((note) => (
        <rect
          key={note.id}
          x={note.start}
          y={geometry.span - (note.pitch - geometry.min) - 1}
          width={Math.max(0.1, Math.min(note.duration, clip.length - note.start))}
          height={0.78}
          rx={0.12}
          opacity={0.45 + note.velocity * 0.5}
        />
      ))}
    </svg>
  )
}

interface ClipDrag {
  mode: 'move' | 'resize'
  pointerId: number
  startX: number
  startY: number
  moved: boolean
  start: number
  length: number
  rowDelta: number
}

function ClipBlock({
  clip,
  track,
  trackIndex,
  trackCount,
  ppb,
  selected,
  snap,
  tracks,
}: {
  clip: Clip
  track: Track
  trackIndex: number
  trackCount: number
  ppb: number
  selected: boolean
  snap: number
  tracks: Track[]
}) {
  const selectClip = useProjectStore((state) => state.selectClip)
  const setTab = useMobileStore((state) => state.setTab)
  const [drag, setDrag] = useState<ClipDrag | null>(null)
  const dragRef = useRef<ClipDrag | null>(null)
  const timeSig = useProjectStore((state) => state.project.timeSig)

  const begin = (event: React.PointerEvent, mode: 'move' | 'resize') => {
    if (!selected) return
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const next: ClipDrag = {
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      start: clip.start,
      length: clip.length,
      rowDelta: 0,
    }
    dragRef.current = next
    setDrag(next)
  }

  const move = (event: React.PointerEvent) => {
    const current = dragRef.current
    if (!current || current.pointerId !== event.pointerId) return
    const dx = event.clientX - current.startX
    const dy = event.clientY - current.startY
    const moved = current.moved || Math.abs(dx) > 5 || Math.abs(dy) > 5
    let next: ClipDrag
    if (current.mode === 'resize') {
      const length = Math.max(snap, snapBeatTo(clip.length + dx / ppb, snap))
      next = { ...current, moved, length }
    } else {
      const start = Math.max(0, snapBeatTo(clip.start + dx / ppb, snap))
      const rowDelta = clamp(Math.round(dy / ROW_H), -trackIndex, trackCount - 1 - trackIndex)
      next = { ...current, moved, start, rowDelta }
    }
    dragRef.current = next
    setDrag(next)
  }

  const end = (event: React.PointerEvent) => {
    const current = dragRef.current
    if (!current || current.pointerId !== event.pointerId) return
    dragRef.current = null
    setDrag(null)
    if (!current.moved) {
      // A tap on a clip that is already selected opens it in the editor.
      setTab('edit')
      return
    }
    if (current.mode === 'resize') {
      useProjectStore.getState().updateClip(track.id, clip.id, { length: current.length })
      return
    }
    const target = tracks[trackIndex + current.rowDelta] ?? track
    if (current.start !== clip.start || target.id !== track.id) {
      moveClipBetweenTracks(track.id, target.id, clip.id, current.start, clip.length)
      useProjectStore.getState().selectClip(target.id, clip.id)
    }
  }

  const start = drag ? drag.start : clip.start
  const length = drag ? drag.length : clip.length
  const style: CSSProperties = {
    left: start * ppb,
    width: Math.max(8, length * ppb - 2),
    transform: drag && drag.rowDelta ? `translateY(${drag.rowDelta * ROW_H}px)` : undefined,
    '--c': track.color,
  } as CSSProperties
  const bars = Math.round((clip.length / timeSig) * 10) / 10

  return (
    <div
      className={`m-clip ${selected ? 'is-selected' : ''} ${drag ? 'is-dragging' : ''}`}
      style={style}
      onClick={(event) => {
        event.stopPropagation()
        if (!selected) selectClip(track.id, clip.id)
      }}
      onPointerDown={(event) => begin(event, 'move')}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      role="button"
      aria-label={`${clip.name}, ${bars} bars on ${track.name}`}
      aria-pressed={selected}
    >
      <span className="m-clip-name">{clip.name}</span>
      <ClipPreview clip={clip} track={track} />
      {selected && (
        <i
          className="m-clip-grip"
          onPointerDown={(event) => begin(event, 'resize')}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          aria-hidden="true"
        />
      )}
    </div>
  )
}

function LaneHead({ track, selected }: { track: Track; selected: boolean }) {
  const selectTrack = useProjectStore((state) => state.selectTrack)
  const setTrackSheetId = useMobileStore((state) => state.setTrackSheetId)
  const info = INSTRUMENT_MAP[track.instrument]
  return (
    <div
      className={`m-lane-head ${selected ? 'is-selected' : ''} ${track.mute ? 'is-muted' : ''}`}
      style={{ '--c': track.color } as CSSProperties}
    >
      <button
        className="m-lane-id"
        onClick={() => {
          if (selected) setTrackSheetId(track.id)
          else selectTrack(track.id)
        }}
        aria-label={`${track.name}. ${selected ? 'Open track settings' : 'Select track'}`}
      >
        <span className="m-lane-icon">
          <TrackIcon instrument={track.instrument} size={15} />
        </span>
        <span className="m-lane-text">
          <b>{track.name}</b>
          <small>{info.shortName}</small>
        </span>
      </button>
      <div className="m-lane-ms">
        <button className={track.mute ? 'is-mute' : ''} onClick={() => toggleMute(track.id)} aria-label={`Mute ${track.name}`} aria-pressed={track.mute}>
          M
        </button>
        <button className={track.solo ? 'is-solo' : ''} onClick={() => toggleSolo(track.id)} aria-label={`Solo ${track.name}`} aria-pressed={track.solo}>
          S
        </button>
        <button onClick={() => setTrackSheetId(track.id)} aria-label={`${track.name} settings`}>
          <Ellipsis size={15} />
        </button>
      </div>
    </div>
  )
}

function ActionBar({ project }: { project: Project }) {
  const selectedClipId = useProjectStore((state) => state.selectedClipId)
  const selectedTrackId = useProjectStore((state) => state.selectedTrackId)
  const setTab = useMobileStore((state) => state.setTab)
  const updateProject = useProjectStore((state) => state.updateProject)
  const selectedClip = useMemo(() => {
    if (!selectedClipId) return null
    for (const track of project.tracks) {
      const clip = track.clips.find((item) => item.id === selectedClipId)
      if (clip) return { track, clip }
    }
    return null
  }, [project, selectedClipId])
  const track = project.tracks.find((item) => item.id === selectedTrackId) ?? project.tracks[0]

  if (selectedClip) {
    const { clip } = selectedClip
    return (
      <div className="m-actionbar" style={{ '--c': selectedClip.track.color } as CSSProperties}>
        <div className="m-action-title">
          <b>{clip.name}</b>
          <small>{selectedClip.track.name}</small>
        </div>
        <button onClick={() => setTab('edit')}>
          <Pencil size={18} />
          <span>Edit</span>
        </button>
        <button onClick={() => duplicateSelectedClip()}>
          <Copy size={18} />
          <span>Duplicate</span>
        </button>
        <button
          onClick={() => {
            const beat = useSessionStore.getState().isPlaying ? engine.getPosition() : useSessionStore.getState().pausedBeat
            if (beat <= clip.start + 0.01 || beat >= clip.start + clip.length - 0.01) {
              useSessionStore.getState().toast('Move the playhead onto the region', 'Tap the ruler to place it where you want to split.')
              return
            }
            splitSelectedClip()
          }}
        >
          <Scissors size={18} />
          <span>Split</span>
        </button>
        <button
          onClick={() => {
            updateProject({ loop: { enabled: true, start: clip.start, end: clip.start + clip.length } })
            seekTo(clip.start)
          }}
        >
          <Repeat size={18} />
          <span>Loop</span>
        </button>
        <button className="is-danger" onClick={() => deleteSelectedClip()}>
          <Trash2 size={18} />
          <span>Delete</span>
        </button>
      </div>
    )
  }

  if (!track) return null
  return (
    <div className="m-actionbar" style={{ '--c': track.color } as CSSProperties}>
      <div className="m-action-title">
        <b>{track.name}</b>
        <small>Double-tap a lane to add a region</small>
      </div>
      <button
        onClick={() => {
          addClipOnTrack(track.id, undefined, 2)
        }}
      >
        <Plus size={18} />
        <span>Region</span>
      </button>
      <button onClick={() => void toggleRecording()}>
        <Circle size={17} fill="currentColor" className="m-rec-dot" />
        <span>Record</span>
      </button>
      <button onClick={() => useMobileStore.getState().setTrackSheetId(track.id)}>
        <Ellipsis size={18} />
        <span>Track</span>
      </button>
    </div>
  )
}

export function TracksView() {
  const project = useProjectStore((state) => state.project)
  const selectedTrackId = useProjectStore((state) => state.selectedTrackId)
  const selectedClipIds = useProjectStore((state) => state.selectedClipIds)
  const selectTrack = useProjectStore((state) => state.selectTrack)
  const ppb = useMobileStore((state) => state.trackZoom)
  const setZoom = useMobileStore((state) => state.setTrackZoom)
  const setSoundPicker = useMobileStore((state) => state.setSoundPicker)
  const metronome = useSessionStore((state) => state.metronome)
  const scrollRef = useRef<HTMLDivElement>(null)
  const rulerRef = useRef<HTMLDivElement>(null)
  const playheadRef = useRef<HTMLDivElement>(null)
  const capRef = useRef<HTMLDivElement>(null)
  const touching = useRef(false)
  const pinch = useRef<{ distance: number; zoom: number; anchorBeat: number; cx: number } | null>(null)
  const pendingScroll = useRef<number | null>(null)
  const lastTap = useRef({ time: 0, x: 0, y: 0 })

  const timeSig = project.timeSig
  const snap = ppb >= 30 ? 0.5 : 1
  const totalBeats = Math.ceil((projectEnd(project) + timeSig * 4) / timeSig) * timeSig
  const barPx = timeSig * ppb
  const contentW = totalBeats * ppb
  const selectedSet = useMemo(() => new Set(selectedClipIds), [selectedClipIds])

  // Playhead follows the engine without re-rendering React.
  useEffect(() => {
    let frame = 0
    const loop = () => {
      const session = useSessionStore.getState()
      const beat = session.isPlaying ? engine.getPosition() : session.pausedBeat
      const x = beat * ppb
      if (playheadRef.current) playheadRef.current.style.transform = `translate3d(${x}px,0,0)`
      if (capRef.current) capRef.current.style.transform = `translate3d(${x}px,0,0)`
      const scroller = scrollRef.current
      if (scroller && session.isPlaying && !touching.current) {
        const absolute = HEADER_W + x
        if (absolute > scroller.scrollLeft + scroller.clientWidth - 32 || absolute < scroller.scrollLeft + HEADER_W) {
          scroller.scrollLeft = Math.max(0, x - 24)
        }
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [ppb])

  useLayoutEffect(() => {
    if (pendingScroll.current !== null && scrollRef.current) {
      scrollRef.current.scrollLeft = pendingScroll.current
      pendingScroll.current = null
    }
  }, [ppb])

  const seekFromPointer = useCallback(
    (clientX: number) => {
      const rect = rulerRef.current?.getBoundingClientRect()
      if (!rect) return
      seekTo(snapBeatTo((clientX - rect.left) / ppb, 0.25))
    },
    [ppb],
  )

  const zoomBy = (factor: number) => {
    const scroller = scrollRef.current
    if (scroller) {
      const center = HEADER_W + (scroller.clientWidth - HEADER_W) / 2
      const anchorBeat = (scroller.scrollLeft + center - HEADER_W) / ppb
      const next = clamp(ppb * factor, TRACK_ZOOM.min, TRACK_ZOOM.max)
      pendingScroll.current = anchorBeat * next + HEADER_W - center
    }
    setZoom(ppb * factor)
  }

  const touchDistance = (event: React.TouchEvent) => {
    const [a, b] = [event.touches[0], event.touches[1]]
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
  }

  const onTouchStart = (event: React.TouchEvent) => {
    touching.current = true
    if (event.touches.length === 2 && scrollRef.current) {
      const rect = scrollRef.current.getBoundingClientRect()
      const cx = (event.touches[0].clientX + event.touches[1].clientX) / 2 - rect.left
      pinch.current = {
        distance: touchDistance(event),
        zoom: ppb,
        cx,
        anchorBeat: (scrollRef.current.scrollLeft + cx - HEADER_W) / ppb,
      }
    }
  }
  const onTouchMove = (event: React.TouchEvent) => {
    const state = pinch.current
    if (!state || event.touches.length !== 2) return
    const next = clamp(state.zoom * (touchDistance(event) / state.distance), TRACK_ZOOM.min, TRACK_ZOOM.max)
    pendingScroll.current = state.anchorBeat * next + HEADER_W - state.cx
    setZoom(next)
  }
  const onTouchEnd = (event: React.TouchEvent) => {
    if (event.touches.length < 2) pinch.current = null
    if (event.touches.length === 0) touching.current = false
  }

  const onLaneClick = (event: React.MouseEvent<HTMLDivElement>, track: Track) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - rect.left
    const now = performance.now()
    const previous = lastTap.current
    const isDouble = now - previous.time < 360 && Math.abs(previous.x - event.clientX) < 28 && Math.abs(previous.y - event.clientY) < 28
    lastTap.current = { time: now, x: event.clientX, y: event.clientY }
    if (isDouble) {
      lastTap.current = { time: 0, x: 0, y: 0 }
      const beat = Math.floor(x / ppb / timeSig) * timeSig
      addClipOnTrack(track.id, beat, 2)
      return
    }
    selectTrack(track.id, null)
  }

  const loop = project.loop
  const barCount = Math.ceil(totalBeats / timeSig)

  return (
    <div className="m-tracks">
      <div className="m-toolbar">
        <button className={`m-tool ${loop.enabled ? 'is-on' : ''}`} onClick={() => toggleLoop()} aria-pressed={loop.enabled}>
          <Repeat size={17} />
          <span>Loop</span>
        </button>
        <button className={`m-tool ${metronome ? 'is-on' : ''}`} onClick={() => toggleMetronome()} aria-pressed={metronome}>
          <Timer size={17} />
          <span>Click</span>
        </button>
        <span className="m-toolbar-gap" />
        <button className="m-icon-btn m-small" onClick={() => zoomBy(1 / 1.3)} disabled={ppb <= TRACK_ZOOM.min} aria-label="Zoom out">
          <ZoomOut size={18} />
        </button>
        <button className="m-icon-btn m-small" onClick={() => zoomBy(1.3)} disabled={ppb >= TRACK_ZOOM.max} aria-label="Zoom in">
          <ZoomIn size={18} />
        </button>
        <button className="m-tool m-tool-accent" onClick={() => setSoundPicker('add')}>
          <Plus size={17} />
          <span>Track</span>
        </button>
      </div>

      <div
        className="m-timeline"
        ref={scrollRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <div className="m-tl-inner" style={{ width: HEADER_W + contentW, minHeight: '100%' }}>
          <div className="m-ruler" style={{ height: RULER_H }}>
            <div className="m-ruler-corner" style={{ width: HEADER_W }}>
              <span>{project.tracks.length} tracks</span>
            </div>
            <div
              className="m-ruler-scale"
              ref={rulerRef}
              style={{ width: contentW, '--bar-w': `${barPx}px` } as CSSProperties}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId)
                seekFromPointer(event.clientX)
              }}
              onPointerMove={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) seekFromPointer(event.clientX)
              }}
            >
              {loop.enabled && (
                <i className="m-loop-band" style={{ left: loop.start * ppb, width: (loop.end - loop.start) * ppb }} />
              )}
              {project.sections.map((section, index) => (
                <i
                  key={section.id}
                  className="m-section-band"
                  style={{ left: section.start * ppb, width: section.length * ppb - 2, background: sectionColor(section, index) }}
                >
                  {section.length * ppb > 54 ? section.name : ''}
                </i>
              ))}
              {Array.from({ length: barCount }, (_, bar) => (
                <b key={bar} style={{ left: bar * barPx }}>
                  {barPx >= 26 || bar % 2 === 0 ? bar + 1 : ''}
                </b>
              ))}
              <div className="m-cap" ref={capRef} />
            </div>
          </div>

          <div className="m-lanes" style={{ '--bar-w': `${barPx}px`, '--beat-w': `${ppb}px` } as CSSProperties}>
            {project.tracks.map((track, trackIndex) => {
              const selected = track.id === selectedTrackId
              return (
                <div className={`m-lane-row ${selected ? 'is-selected' : ''}`} key={track.id} style={{ height: ROW_H }}>
                  <LaneHead track={track} selected={selected} />
                  <div className="m-lane" style={{ width: contentW }} onClick={(event) => onLaneClick(event, track)}>
                    {track.clips.map((clip) => (
                      <ClipBlock
                        key={clip.id}
                        clip={clip}
                        track={track}
                        trackIndex={trackIndex}
                        trackCount={project.tracks.length}
                        tracks={project.tracks}
                        ppb={ppb}
                        selected={selectedSet.has(clip.id)}
                        snap={snap}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
            <div className="m-add-row">
              <button onClick={() => setSoundPicker('add')}>
                <Plus size={18} /> Add a track
              </button>
            </div>
          </div>
          <div className="m-playhead" ref={playheadRef} style={{ left: HEADER_W }} />
        </div>
      </div>
      <ActionBar project={project} />
    </div>
  )
}
