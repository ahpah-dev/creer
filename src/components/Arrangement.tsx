import { useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { Pencil, Plus } from 'lucide-react'
import type { Clip, DragState, LoopSettings, Track } from '../types'
import { useProjectStore } from '../store/project'
import { useSessionStore } from '../store/session'
import { engine } from '../audio/engine'
import { getCurrentBeat, seekTo } from '../lib/transport'
import { addClipOnTrack } from '../lib/clips'
import { moveClipBetweenTracks } from '../lib/tracks'
import { clamp, projectEnd, snapBeat, uid } from '../lib/utils'
import { SECTION_COLORS, nextSectionName, sectionColor } from '../data/sections'
import { ClipView } from './ClipView'
import { TrackHeader } from './TrackHeader'
import { SectionEditor } from './SectionEditor'

const TRACK_HEIGHT = 68
const RULER_HEIGHT = 44
const TRACK_GAP = 6

const getNearestClip = (track: Track, beat: number, currentId: string | null) => {
  const existing = track.clips.find((clip) => clip.id === currentId)
  if (existing) return existing
  let best: Clip | null = null
  let distance = Infinity
  for (const clip of track.clips) {
    const center = clip.start + clip.length / 2
    const nextDistance = Math.abs(center - beat)
    if (nextDistance < distance) {
      distance = nextDistance
      best = clip
    }
  }
  return best
}

export function Arrangement() {
  const project = useProjectStore((state) => state.project)
  const selectedTrackId = useProjectStore((state) => state.selectedTrackId)
  const selectedClipIds = useProjectStore((state) => state.selectedClipIds)
  const updateClip = useProjectStore((state) => state.updateClip)
  const updateProject = useProjectStore((state) => state.updateProject)
  const selectClip = useProjectStore((state) => state.selectClip)
  const selectTrack = useProjectStore((state) => state.selectTrack)
  const zoom = useSessionStore((state) => state.zoom)
  const snap = useSessionStore((state) => state.snap)
  const isPlaying = useSessionStore((state) => state.isPlaying)
  const isRecording = useSessionStore((state) => state.isRecording)
  const pausedBeat = useSessionStore((state) => state.pausedBeat)
  const setDock = useSessionStore((state) => state.setDock)
  const setDockCollapsed = useSessionStore((state) => state.setDockCollapsed)
  const setSelectedNoteIds = useSessionStore((state) => state.setSelectedNoteIds)
  const setModal = useSessionStore((state) => state.setModal)
  const toast = useSessionStore((state) => state.toast)

  const timelineRef = useRef<HTMLDivElement>(null)
  const timelineContentRef = useRef<HTMLDivElement>(null)
  const headersContentRef = useRef<HTMLDivElement>(null)
  const rulerRef = useRef<HTMLDivElement>(null)
  const scrubRef = useRef(false)
  const dragRef = useRef<DragState | null>(null)
  const dragListenersRef = useRef<{ move: (event: PointerEvent) => void; up: (event: PointerEvent) => void; cancel: () => void } | null>(null)
  const loopPreviewRef = useRef<LoopSettings | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [loopPreview, setLoopPreview] = useState<LoopSettings | null>(null)
  const [clipMarquee, setClipMarquee] = useState<{
    x1: number
    y1: number
    x2: number
    y2: number
  } | null>(null)
  const [sectionEditor, setSectionEditor] = useState<{
    sectionId: string
    x: number
    y: number
  } | null>(null)

  const contentBeats = Math.max(64, Math.ceil((projectEnd(project) + 8) / project.timeSig) * project.timeSig)
  const contentWidth = contentBeats * zoom
  const barWidth = zoom * project.timeSig
  const barCount = Math.ceil(contentBeats / project.timeSig)
  const barStep = barWidth < 38 ? 4 : barWidth < 62 ? 2 : 1
  const displayLoop = loopPreview ?? project.loop
  const hasSolo = project.tracks.some((track) => track.solo)
  const lastSectionEnd = project.sections.reduce(
    (max, section) => Math.max(max, section.start + section.length),
    0,
  )

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      if (scrubRef.current) {
        const rect = rulerRef.current?.getBoundingClientRect()
        if (!rect) return
        const rawBeat = (event.clientX - rect.left) / zoom
        seekTo(clamp(snapBeat(rawBeat, event.altKey ? 0.25 : snap), 0, contentBeats))
      }
    }
    const handleUp = () => {
      scrubRef.current = false
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
  }, [zoom, snap, contentBeats])

  // Keep the separate track header column in sync with the timeline's vertical scroll.
  const handleScroll = () => {
    const scroller = timelineRef.current
    const headers = headersContentRef.current
    if (!scroller || !headers) return
    headers.style.transform = `translateY(${-scroller.scrollTop}px)`
  }

  // Paint the playhead without re-rendering the whole arrangement on every frame.
  useEffect(() => {
    const content = timelineContentRef.current
    const scroller = timelineRef.current
    if (!content) return
    let frame = 0
    const paint = () => {
      const beat = isPlaying ? engine.getPosition() : pausedBeat
      const x = beat * zoom
      content.style.setProperty('--playhead-left', `${x}px`)
      content.style.setProperty('--playhead-opacity', '1')
      if (isPlaying && scroller) {
        const visibleStart = scroller.scrollLeft
        const visibleEnd = visibleStart + scroller.clientWidth
        if (x > visibleEnd - 24) scroller.scrollLeft = Math.max(0, x - scroller.clientWidth + 120)
        else if (x < visibleStart + 12) scroller.scrollLeft = Math.max(0, x - 70)
      }
    }
    paint()
    if (!isPlaying) return
    const loop = () => {
      paint()
      frame = window.requestAnimationFrame(loop)
    }
    frame = window.requestAnimationFrame(loop)
    return () => window.cancelAnimationFrame(frame)
  }, [isPlaying, pausedBeat, zoom])

  useEffect(() => {
    return () => {
      document.body.classList.remove('is-clip-dragging')
      const listeners = dragListenersRef.current
      if (listeners) {
        window.removeEventListener('pointermove', listeners.move)
        window.removeEventListener('pointerup', listeners.up)
        window.removeEventListener('pointercancel', listeners.cancel)
      }
    }
  }, [])

  // Make sure a newly selected track is not hidden below the fold.
  useEffect(() => {
    const scroller = timelineRef.current
    if (!scroller) return
    const index = project.tracks.findIndex((track) => track.id === selectedTrackId)
    if (index < 0) return
    const rowTop = RULER_HEIGHT + index * TRACK_HEIGHT
    const rowBottom = rowTop + TRACK_HEIGHT
    const visibleTop = scroller.scrollTop + RULER_HEIGHT
    const visibleBottom = scroller.scrollTop + scroller.clientHeight
    if (rowBottom > visibleBottom - 4) {
      scroller.scrollTop = rowBottom - scroller.clientHeight + 10
    } else if (rowTop < visibleTop) {
      scroller.scrollTop = Math.max(0, rowTop - RULER_HEIGHT - 6)
    }
  }, [selectedTrackId, project.tracks.length])

  const beatFromClientX = (clientX: number, bypassSnap = false) => {
    const rect = rulerRef.current?.getBoundingClientRect()
    if (!rect) return 0
    const raw = (clientX - rect.left) / zoom
    return clamp(bypassSnap ? raw : snapBeat(raw, snap), 0, contentBeats)
  }

  const handleRulerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    if (
      target.closest('.section-chip') ||
      target.closest('.section-add-button') ||
      target.closest('.loop-handle')
    ) {
      return
    }
    scrubRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    seekTo(beatFromClientX(event.clientX, event.altKey))
  }

  const handleLoopHandleDown = (edge: 'start' | 'end', event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation()
    event.preventDefault()
    const initial = { ...project.loop }
    let latest = initial
    const loopEndLimit = Math.max(project.timeSig * 2, Math.ceil(project.lengthBeats / project.timeSig) * project.timeSig)
    const onMove = (moveEvent: PointerEvent) => {
      const rect = rulerRef.current?.getBoundingClientRect()
      if (!rect) return
      const raw = (moveEvent.clientX - rect.left) / zoom
      const snapped = Math.round(raw / project.timeSig) * project.timeSig
      if (edge === 'start') {
        latest = { ...initial, start: clamp(snapped, 0, initial.end - project.timeSig) }
      } else {
        latest = { ...initial, end: clamp(snapped, initial.start + project.timeSig, loopEndLimit) }
      }
      loopPreviewRef.current = latest
      setLoopPreview(latest)
    }
    const cleanup = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
    const onUp = () => {
      cleanup()
      const next = loopPreviewRef.current
      setLoopPreview(null)
      loopPreviewRef.current = null
      if (next) {
        updateProject({ loop: next })
        if (next.enabled) {
          const position = getCurrentBeat()
          if (position < next.start || position > next.end) {
            window.setTimeout(() => seekTo(next.start), 0)
          }
        }
      }
    }
    const onCancel = () => {
      cleanup()
      setLoopPreview(null)
      loopPreviewRef.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
  }

  const handleTrackSelect = (trackId: string) => {
    const track = useProjectStore.getState().project.tracks.find((item) => item.id === trackId)
    if (!track) return
    const beat = getCurrentBeat()
    const clip = getNearestClip(track, beat, useProjectStore.getState().selectedClipId)
    selectTrack(track.id, clip?.id ?? null)
    setSelectedNoteIds([])
  }

  const handleLaneDown = (event: ReactPointerEvent<HTMLDivElement>, track: Track) => {
    if (event.button !== 0) return
    if ((event.target as HTMLElement).closest('.clip')) return
    const content = timelineContentRef.current
    if (!content) return
    event.preventDefault()
    const contentRect = content.getBoundingClientRect()
    const startX = clamp(event.clientX - contentRect.left, 0, contentWidth)
    const startY = clamp(
      event.clientY - contentRect.top,
      RULER_HEIGHT,
      RULER_HEIGHT + project.tracks.length * TRACK_HEIGHT,
    )
    const beat = beatFromClientX(event.clientX, event.altKey)
    const additive = event.shiftKey
    const baseIds = additive ? [...useProjectStore.getState().selectedClipIds] : []
    let moved = false
    let lastKey = ''

    const selectInBox = (x1: number, y1: number, x2: number, y2: number) => {
      const left = Math.min(x1, x2)
      const right = Math.max(x1, x2)
      const top = Math.min(y1, y2)
      const bottom = Math.max(y1, y2)
      const state = useProjectStore.getState()
      const hits: string[] = []
      state.project.tracks.forEach((laneTrack, index) => {
        const laneTop = RULER_HEIGHT + index * TRACK_HEIGHT + TRACK_GAP / 2
        const laneBottom = laneTop + TRACK_HEIGHT - TRACK_GAP
        if (laneBottom < top || laneTop > bottom) return
        for (const clip of laneTrack.clips) {
          const clipLeft = clip.start * zoom
          const clipRight = (clip.start + clip.length) * zoom
          if (clipRight < left || clipLeft > right) continue
          hits.push(clip.id)
        }
      })
      const ids = [...new Set([...baseIds, ...hits])]
      const key = ids.join('|')
      if (key === lastKey) return
      lastKey = key
      const primary =
        state.selectedClipId && ids.includes(state.selectedClipId)
          ? state.selectedClipId
          : (ids[0] ?? null)
      useProjectStore.getState().selectClips(ids, primary)
    }

    const onMove = (moveEvent: PointerEvent) => {
      const x = clamp(moveEvent.clientX - contentRect.left, 0, contentWidth)
      const y = clamp(
        moveEvent.clientY - contentRect.top,
        RULER_HEIGHT,
        RULER_HEIGHT + project.tracks.length * TRACK_HEIGHT,
      )
      if (!moved && (Math.abs(x - startX) > 3 || Math.abs(y - startY) > 3)) {
        moved = true
        document.body.classList.add('is-marquee-selecting')
      }
      if (!moved) return
      setClipMarquee({ x1: startX, y1: startY, x2: x, y2: y })
      selectInBox(startX, startY, x, y)
    }

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      document.body.classList.remove('is-marquee-selecting')
      setClipMarquee(null)
    }

    const onUp = () => {
      cleanup()
      if (moved) {
        useSessionStore.getState().setSelectedNoteIds([])
        return
      }
      const current = useProjectStore.getState()
      const nearest = getNearestClip(track, beat, current.selectedClipId)
      selectTrack(track.id, nearest?.id ?? null)
      setSelectedNoteIds([])
      seekTo(beat)
    }

    const onCancel = () => cleanup()
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
  }

  const handleLaneDoubleClick = (event: ReactMouseEvent<HTMLDivElement>, track: Track) => {
    if ((event.target as HTMLElement).closest('.clip')) return
    const beat = beatFromClientX(event.clientX, false)
    const at = Math.floor(beat / project.timeSig) * project.timeSig
    addClipOnTrack(track.id, at)
    toast('Empty clip added', 'Draw notes below, or add a loop from the library.', 'success')
  }

  const beginClipDrag = (
    event: ReactPointerEvent<HTMLDivElement>,
    track: Track,
    clip: Clip,
    mode: DragState['mode'],
  ) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    selectClip(track.id, clip.id)
    setSelectedNoteIds([])
    const initial: DragState = {
      clipId: clip.id,
      sourceTrackId: track.id,
      mode,
      originX: event.clientX,
      originY: event.clientY,
      originalStart: clip.start,
      originalLength: clip.length,
      start: clip.start,
      length: clip.length,
      targetTrackId: track.id,
      moved: false,
    }
    dragRef.current = initial
    setDrag(initial)
    document.body.classList.add('is-clip-dragging')

    const onMove = (moveEvent: PointerEvent) => {
      const current = dragRef.current
      if (!current) return
      const dx = moveEvent.clientX - current.originX
      const dy = moveEvent.clientY - current.originY
      const noSnap = moveEvent.altKey
      let start = current.start
      let length = current.length
      let targetTrackId = current.targetTrackId
      if (current.mode === 'move') {
        const rawStart = current.originalStart + dx / zoom
        start = noSnap ? Math.max(0, rawStart) : Math.max(0, snapBeat(rawStart, snap))
        const under = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY) as HTMLElement | null
        const lane = under?.closest('[data-track-lane]') as HTMLElement | null
        if (lane?.dataset.trackLane) targetTrackId = lane.dataset.trackLane
        length = current.originalLength
      } else {
        const rawLength = current.originalLength + dx / zoom
        length = noSnap ? Math.max(0.25, rawLength) : Math.max(snap, snapBeat(rawLength, snap))
      }
      const moved = current.moved || Math.abs(dx) > 3 || Math.abs(dy) > 3
      const next = { ...current, start, length, targetTrackId, moved }
      dragRef.current = next
      setDrag(next)
    }

    const finish = (commit: boolean) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      dragListenersRef.current = null
      document.body.classList.remove('is-clip-dragging')
      const current = dragRef.current
      dragRef.current = null
      setDrag(null)
      if (!commit || !current || !current.moved) return
      if (current.mode === 'move') {
        moveClipBetweenTracks(current.sourceTrackId, current.targetTrackId, current.clipId, current.start, current.length)
        selectClip(current.targetTrackId, current.clipId)
      } else {
        updateClip(current.sourceTrackId, current.clipId, { length: current.length })
        selectClip(current.sourceTrackId, current.clipId)
      }
    }
    const onUp = () => finish(true)
    const onCancel = () => finish(false)

    dragListenersRef.current = { move: onMove, up: onUp, cancel: onCancel }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
  }

  const openEditor = () => {
    setDock('editor')
    setDockCollapsed(false)
  }

  const loopSection = (start: number, length: number) => {
    const end = Math.min(project.lengthBeats, start + length)
    updateProject({ loop: { enabled: true, start, end } })
    if (getCurrentBeat() < start || getCurrentBeat() >= end) seekTo(start)
    toast('Section looping', 'The playhead will repeat this part. Press L to turn the loop off.')
  }

  const sectionAnchor = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect()
    return {
      x: Math.max(8, Math.min(rect.left - 36, window.innerWidth - 300)),
      y: Math.min(rect.bottom + 7, window.innerHeight - 288),
    }
  }

  const openSectionEditor = (sectionId: string, event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    const position = sectionAnchor(event.currentTarget)
    setSectionEditor({ sectionId, ...position })
  }

  const addSection = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    const project = useProjectStore.getState().project
    const end = project.sections.reduce(
      (max, section) => Math.max(max, section.start + section.length),
      0,
    )
    const start = Math.ceil(end / project.timeSig) * project.timeSig
    const section = {
      id: uid('s'),
      name: nextSectionName(project.sections),
      start,
      length: project.timeSig * 4,
      color: SECTION_COLORS[project.sections.length % SECTION_COLORS.length],
    }
    updateProject({
      sections: [...project.sections, section],
      lengthBeats: Math.max(project.lengthBeats, start + section.length),
    })
    const position = sectionAnchor(event.currentTarget)
    setSectionEditor({ sectionId: section.id, ...position })
    window.setTimeout(() => {
      timelineRef.current?.scrollTo({ left: Math.max(0, start * zoom - 80), behavior: 'smooth' })
    }, 30)
    toast('Section added', `"${section.name}" starts at bar ${Math.floor(start / project.timeSig) + 1}.`, 'success')
  }

  const nudgeLoopEdge = (edge: 'start' | 'end', direction: number) => {
    const step = project.timeSig
    const limit = Math.max(project.timeSig * 2, Math.ceil(project.lengthBeats / project.timeSig) * project.timeSig)
    const loop = { ...displayLoop }
    if (edge === 'start') {
      loop.start = clamp(loop.start + direction * step, 0, loop.end - step)
    } else {
      loop.end = clamp(loop.end + direction * step, loop.start + step, limit)
    }
    updateProject({ loop }, { coalesce: 'loop-nudge' })
  }

  return (
    <section className="arrangement" aria-label="Arrangement">
      <div
        className="track-headers"
        onWheel={(event) => {
          if (!timelineRef.current || event.deltaY === 0) return
          timelineRef.current.scrollTop += event.deltaY
        }}
      >
        <div className="headers-top">
          <div>
            <span className="headers-eyebrow">SESSION</span>
            <strong>Tracks</strong>
          </div>
          <span className="track-count">{String(project.tracks.length).padStart(2, '0')}</span>
        </div>
        <div className="headers-viewport">
          <div className="headers-content" ref={headersContentRef}>
            {project.tracks.map((track, index) => (
              <TrackHeader
                key={track.id}
                track={track}
                index={index}
                selected={track.id === selectedTrackId}
                dimmed={hasSolo && !track.solo}
                onSelect={handleTrackSelect}
              />
            ))}
            <div className="add-track-footer">
              <button className="ghost-add-track" onClick={() => setModal('addTrack')}>
                <Plus size={15} />
                <span>Add another track</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="timeline-scroll" ref={timelineRef} onScroll={handleScroll}>
        <div
          className={`timeline-content ${zoom >= 22 ? 'show-sixteenths' : ''} ${isRecording ? 'is-recording' : ''}`}
          ref={timelineContentRef}
          style={{
            width: contentWidth,
            ['--beat-w' as string]: `${zoom}px`,
            ['--bar-w' as string]: `${barWidth}px`,
            ['--eighth-w' as string]: `${zoom / 2}px`,
            ['--sixteenth-w' as string]: `${zoom / 4}px`,
            ['--playhead-left' as string]: '0px',
          }}
        >
          <div className="ruler" ref={rulerRef} onPointerDown={handleRulerDown}>
            <div className="ruler-section-lane" aria-label="Song sections">
              {project.sections.map((section, index) => (
                <div
                  key={section.id}
                  className="section-chip"
                  style={{
                    left: section.start * zoom,
                    width: Math.max(20, section.length * zoom - 2),
                    ['--section-color' as string]: sectionColor(section, index),
                  }}
                >
                  <button
                    className="section-seek"
                    onClick={(event) => {
                      event.stopPropagation()
                      seekTo(section.start)
                    }}
                    onDoubleClick={(event) => {
                      event.stopPropagation()
                      loopSection(section.start, section.length)
                    }}
                    title={`${section.name} — double-click to loop this section`}
                  >
                    {section.name}
                  </button>
                  <button
                    className="section-edit-button"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => openSectionEditor(section.id, event)}
                    aria-label={`Edit ${section.name}`}
                    title="Edit section"
                  >
                    <Pencil size={9} />
                  </button>
                </div>
              ))}
              <button
                className="section-add-button"
                style={{ left: Math.max(0, lastSectionEnd * zoom + 7) }}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={addSection}
                aria-label="Add section"
                title="Add a section"
              >
                <Plus size={10} />
              </button>
            </div>
            <div className="ruler-bars">
              {Array.from({ length: barCount }, (_, index) => (
                <div
                  key={index}
                  className={`bar-mark ${index % barStep === 0 ? 'is-labeled' : ''}`}
                  style={{ left: index * barWidth }}
                >
                  {index % barStep === 0 && <span>{index + 1}</span>}
                </div>
              ))}
            </div>
            <div
              className={`loop-band ${displayLoop.enabled ? 'is-enabled' : ''}`}
              style={{
                left: displayLoop.start * zoom,
                width: Math.max(8, (displayLoop.end - displayLoop.start) * zoom),
              }}
            >
              <div
                className="loop-handle start"
                onPointerDown={(event) => handleLoopHandleDown('start', event)}
                role="slider"
                aria-label="Loop start"
                aria-valuenow={displayLoop.start}
                aria-valuemin={0}
                aria-valuemax={displayLoop.end - project.timeSig}
                tabIndex={0}
                title="Drag to move the loop start"
                onKeyDown={(event) => {
                  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
                  event.preventDefault()
                  nudgeLoopEdge('start', event.key === 'ArrowRight' ? 1 : -1)
                }}
              >
                <span />
              </div>
              <div
                className="loop-handle end"
                onPointerDown={(event) => handleLoopHandleDown('end', event)}
                role="slider"
                aria-label="Loop end"
                aria-valuenow={displayLoop.end}
                aria-valuemin={displayLoop.start + project.timeSig}
                aria-valuemax={Math.max(project.timeSig * 2, project.lengthBeats)}
                tabIndex={0}
                title="Drag to move the loop end"
                onKeyDown={(event) => {
                  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
                  event.preventDefault()
                  nudgeLoopEdge('end', event.key === 'ArrowRight' ? 1 : -1)
                }}
              >
                <span />
              </div>
            </div>
            <div className="ruler-playhead" aria-hidden="true">
              <span />
            </div>
          </div>

          <div
            className="section-wash"
            aria-hidden="true"
            style={{ top: RULER_HEIGHT, height: project.tracks.length * TRACK_HEIGHT }}
          >
            {project.sections.map((section, index) => (
              <span
                key={section.id}
                style={{
                  left: section.start * zoom,
                  width: Math.max(2, section.length * zoom),
                  ['--section-color' as string]: sectionColor(section, index),
                }}
              />
            ))}
          </div>

          <div className="lanes">
            {project.tracks.map((track) => (
              <div
                key={track.id}
                className={`track-lane ${track.id === selectedTrackId ? 'is-selected' : ''} ${track.mute ? 'is-muted' : ''} ${hasSolo && !track.solo ? 'is-solo-muted' : ''}`}
                style={{ height: TRACK_HEIGHT, ['--beat-w' as string]: `${zoom}px` }}
                data-track-lane={track.id}
                onPointerDown={(event) => handleLaneDown(event, track)}
                onDoubleClick={(event) => handleLaneDoubleClick(event, track)}
              >
                <div className="lane-grid" aria-hidden="true" />
                {!track.clips.length && (
                  <div className="lane-empty-hint" aria-hidden="true">
                    Double-click to add a clip
                  </div>
                )}
                {track.clips.map((clip) => {
                  const hidden = drag?.clipId === clip.id
                  if (hidden) return null
                  const width = Math.max(10, clip.length * zoom - 2)
                  return (
                    <div
                      key={clip.id}
                      className="clip-slot"
                      style={{ left: clip.start * zoom, top: TRACK_GAP / 2, width, height: TRACK_HEIGHT - TRACK_GAP }}
                    >
                      <ClipView
                        clip={clip}
                        track={track}
                        width={width}
                        selected={selectedClipIds.includes(clip.id)}
                        onPointerDown={(event, mode) => beginClipDrag(event, track, clip, mode)}
                        onDoubleClick={() => {
                          useProjectStore.getState().selectClip(track.id, clip.id)
                          openEditor()
                        }}
                      />
                    </div>
                  )
                })}
              </div>
            ))}
            <div className="timeline-tail" />
          </div>

          {clipMarquee && (
            <div
              className="clip-marquee"
              style={{
                left: Math.min(clipMarquee.x1, clipMarquee.x2),
                top: Math.min(clipMarquee.y1, clipMarquee.y2),
                width: Math.abs(clipMarquee.x2 - clipMarquee.x1),
                height: Math.abs(clipMarquee.y2 - clipMarquee.y1),
              }}
              aria-hidden="true"
            />
          )}

          {drag &&
            (() => {
              const sourceTrack = project.tracks.find((track) => track.id === drag.sourceTrackId)
              const clip = sourceTrack?.clips.find((item) => item.id === drag.clipId)
              const ghostTrack = project.tracks.find((track) => track.id === drag.targetTrackId) ?? sourceTrack
              const ghostIndex = project.tracks.findIndex((track) => track.id === ghostTrack?.id)
              if (!clip || !ghostTrack) return null
              const width = Math.max(10, drag.length * zoom - 2)
              return (
                <div
                  className="clip-ghost"
                  style={{
                    left: drag.start * zoom,
                    top: RULER_HEIGHT + ghostIndex * TRACK_HEIGHT + TRACK_GAP / 2,
                    width,
                    height: TRACK_HEIGHT - TRACK_GAP,
                  }}
                >
                  <ClipView clip={{ ...clip, length: drag.length }} track={ghostTrack} width={width} selected ghost />
                </div>
              )
            })()}

          <div className="timeline-playhead" aria-hidden="true">
            <span className="playhead-glow" />
          </div>
          <div className="timeline-corner-shade" aria-hidden="true" />
        </div>
      </div>

      {sectionEditor && (
        <SectionEditor
          sectionId={sectionEditor.sectionId}
          x={sectionEditor.x}
          y={sectionEditor.y}
          onClose={() => setSectionEditor(null)}
        />
      )}
    </section>
  )
}
