import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import {
  ArrowDown,
  ArrowUp,
  BoxSelect,
  ChevronDown,
  ClipboardPaste,
  Copy,
  Grid2X2,
  Library,
  Magnet,
  Pencil,
  Plus,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import type { Clip, Note, Track } from '../types'
import { useProjectStore, getSelectedClip } from '../store/project'
import { useSessionStore } from '../store/session'
import { engine } from '../audio/engine'
import { addClipOnTrack } from '../lib/clips'
import { quantizeNotes } from '../lib/clips'
import {
  copySelectedNotes,
  pasteClipboard,
} from '../lib/clipboard'
import { DRUM_NOTE_MAP, DRUM_NOTES, INSTRUMENT_MAP, isDrumInstrument } from '../data/instruments'
import {
  clamp,
  formatBeatPosition,
  isBlackKey,
  midiToName,
  NOTE_LENGTH_OPTIONS,
  snapBeat,
  uid,
} from '../lib/utils'

const LABEL_WIDTH = 58
const ROW_HEIGHT = 16
const MIN_ROWS = 24
const MIN_PIANO_ZOOM = 1
const MAX_PIANO_ZOOM = 8
const PIANO_ZOOM_LEVELS = [1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5, 6, 8]

interface Row {
  pitch: number
  name: string
  black: boolean
  cRow: boolean
}

const buildRows = (track: Track, clip: Clip): Row[] => {
  if (isDrumInstrument(track.instrument)) {
    const extra = clip.notes
      .map((note) => note.pitch)
      .filter((pitch) => !DRUM_NOTES.some((drum) => drum.pitch === pitch))
    const pitches = [...new Set([...DRUM_NOTES.map((drum) => drum.pitch), ...extra])].sort((a, b) => b - a)
    return pitches.map((pitch) => ({
      pitch,
      name: DRUM_NOTE_MAP[pitch]?.short ?? midiToName(pitch),
      black: false,
      cRow: false,
    }))
  }
  const pitches = clip.notes.map((note) => note.pitch)
  const rawMin = pitches.length ? Math.min(...pitches) : 55
  const rawMax = pitches.length ? Math.max(...pitches) : 72
  const rawSpan = rawMax - rawMin + 7
  const span = Math.max(MIN_ROWS, Math.min(48, rawSpan))
  let low = Math.floor(rawMin - (span - (rawMax - rawMin)) / 2)
  low = clamp(low, 24, 96 - span)
  const high = low + span - 1
  const rows: Row[] = []
  for (let pitch = high; pitch >= low; pitch--) {
    rows.push({
      pitch,
      name: midiToName(pitch, true),
      black: isBlackKey(pitch),
      cRow: pitch % 12 === 0,
    })
  }
  return rows
}

export function PianoRoll() {
  const project = useProjectStore((state) => state.project)
  const selectedClipId = useProjectStore((state) => state.selectedClipId)
  const selectedTrackId = useProjectStore((state) => state.selectedTrackId)
  const selected = getSelectedClip(project, selectedClipId)
  const updateClip = useProjectStore((state) => state.updateClip)
  const updateNotes = useProjectStore((state) => state.updateNotes)
  const setDock = useSessionStore((state) => state.setDock)
  const snap = useSessionStore((state) => state.snap)
  const noteLength = useSessionStore((state) => state.noteLength)
  const setNoteLength = useSessionStore((state) => state.setNoteLength)
  const pianoZoom = useSessionStore((state) => state.pianoZoom)
  const setPianoZoom = useSessionStore((state) => state.setPianoZoom)
  const pianoTool = useSessionStore((state) => state.pianoTool)
  const setPianoTool = useSessionStore((state) => state.setPianoTool)
  const selectedNoteIds = useSessionStore((state) => state.selectedNoteIds)
  const setSelectedNoteIds = useSessionStore((state) => state.setSelectedNoteIds)
  const toast = useSessionStore((state) => state.toast)
  const isPlaying = useSessionStore((state) => state.isPlaying)
  const pausedBeat = useSessionStore((state) => state.pausedBeat)

  const [availableWidth, setAvailableWidth] = useState(900)
  const [previewNote, setPreviewNote] = useState<Note | null>(null)
  const [draft, setDraft] = useState<Note | null>(null)
  const [velocityPreview, setVelocityPreview] = useState<{ noteId: string; value: number } | null>(null)
  const [noteMarquee, setNoteMarquee] = useState<{
    x1: number
    y1: number
    x2: number
    y2: number
  } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const velocityScrollRef = useRef<HTMLDivElement>(null)
  const playheadRef = useRef<HTMLDivElement>(null)
  const pendingZoomAnchor = useRef<{ beat: number; viewportX: number } | null>(null)
  const zoomAtPointRef = useRef<(nextZoom: number, clientX?: number) => void>(() => {})
  const auditionRef = useRef<{
    pitch: number
    key: string | null
    cancelled: boolean
    autoTimer: number | null
    releaseTimer: number | null
  } | null>(null)

  const track = selected?.track ?? project.tracks.find((item) => item.id === selectedTrackId) ?? null
  const clip = selected?.clip ?? null
  const rows = useMemo(() => (track && clip ? buildRows(track, clip) : []), [track, clip])
  const fitWidth = clip
    ? Math.max(320, Math.min(clip.length * 72, Math.max(480, availableWidth - LABEL_WIDTH - 20)))
    : 0
  const gridWidth = clip ? Math.max(160, Math.round(fitWidth * pianoZoom)) : 0
  const ppb = clip ? gridWidth / Math.max(0.25, clip.length) : 48
  const contentWidth = LABEL_WIDTH + gridWidth
  const selectedNote = clip?.notes.find((note) => selectedNoteIds.includes(note.id)) ?? null

  const displayNotes = useMemo(() => {
    if (!clip) return []
    let notes = clip.notes
    if (previewNote) notes = notes.map((note) => (note.id === previewNote.id ? previewNote : note))
    if (draft) notes = [...notes, draft]
    return notes
  }, [clip, previewNote, draft])

  const finishAudition = (entry: {
    key: string | null
    cancelled: boolean
    autoTimer: number | null
    releaseTimer: number | null
  }) => {
    if (entry.cancelled) return
    entry.cancelled = true
    if (entry.autoTimer !== null) window.clearTimeout(entry.autoTimer)
    if (entry.releaseTimer !== null) window.clearTimeout(entry.releaseTimer)
    if (entry.key) engine.noteOff(entry.key)
    if (auditionRef.current === entry) auditionRef.current = null
  }

  const stopAudition = (delay = 80) => {
    const entry = auditionRef.current
    if (!entry) return
    if (entry.releaseTimer !== null) window.clearTimeout(entry.releaseTimer)
    if (delay <= 0) {
      finishAudition(entry)
      return
    }
    entry.releaseTimer = window.setTimeout(() => finishAudition(entry), delay)
  }

  const playAudition = (currentTrack: Track, pitch: number, velocity = 0.75, hold = 700) => {
    const previous = auditionRef.current
    if (previous) {
      if (previous.pitch === pitch && !previous.cancelled) {
        if (previous.releaseTimer !== null) {
          window.clearTimeout(previous.releaseTimer)
          previous.releaseTimer = null
        }
        return
      }
      finishAudition(previous)
    }
    const entry = {
      pitch,
      key: null as string | null,
      cancelled: false,
      autoTimer: null as number | null,
      releaseTimer: null as number | null,
    }
    auditionRef.current = entry
    void engine.noteOn(currentTrack.instrument, currentTrack.id, pitch, velocity).then((key) => {
      if (!key) return
      if (entry.cancelled) engine.noteOff(key)
      else entry.key = key
    })
    entry.autoTimer = window.setTimeout(() => finishAudition(entry), hold)
  }

  const stepZoom = (direction: 1 | -1) => {
    if (direction > 0) {
      return (
        PIANO_ZOOM_LEVELS.find((level) => level > pianoZoom + 0.001) ?? MAX_PIANO_ZOOM
      )
    }
    return (
      [...PIANO_ZOOM_LEVELS].reverse().find((level) => level < pianoZoom - 0.001) ??
      MIN_PIANO_ZOOM
    )
  }

  const zoomAtPoint = (nextZoom: number, clientX?: number) => {
    if (!clip) return
    const next = Math.round(clamp(nextZoom, MIN_PIANO_ZOOM, MAX_PIANO_ZOOM) * 100) / 100
    if (Math.abs(next - pianoZoom) < 0.001) return
    const scroller = scrollRef.current
    if (!scroller) {
      setPianoZoom(next)
      return
    }
    const rect = scroller.getBoundingClientRect()
    const viewportX =
      clientX === undefined
        ? Math.max(LABEL_WIDTH, rect.width / 2)
        : clamp(clientX - rect.left, LABEL_WIDTH, Math.max(LABEL_WIDTH, rect.width - 12))
    const beat = clamp((scroller.scrollLeft + viewportX - LABEL_WIDTH) / ppb, 0, clip.length)
    pendingZoomAnchor.current = { beat, viewportX }
    setPianoZoom(next)
  }
  zoomAtPointRef.current = zoomAtPoint

  useLayoutEffect(() => {
    const pending = pendingZoomAnchor.current
    if (!pending || !clip) return
    const scroller = scrollRef.current
    if (!scroller) return
    const nextPpb = gridWidth / Math.max(0.25, clip.length)
    const maxScroll = Math.max(0, LABEL_WIDTH + gridWidth - scroller.clientWidth)
    const nextLeft = clamp(
      LABEL_WIDTH + pending.beat * nextPpb - pending.viewportX,
      0,
      maxScroll,
    )
    scroller.scrollLeft = nextLeft
    if (velocityScrollRef.current) velocityScrollRef.current.scrollLeft = nextLeft
    pendingZoomAnchor.current = null
  }, [pianoZoom, gridWidth, clip])

  useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      const delta = event.deltaY || event.deltaX
      if (!delta) return
      event.preventDefault()
      const current = useSessionStore.getState().pianoZoom
      const factor = Math.exp(-delta * 0.0018)
      zoomAtPointRef.current(current * factor, event.clientX)
    }
    scroller.addEventListener('wheel', onWheel, { passive: false })
    return () => scroller.removeEventListener('wheel', onWheel)
  }, [clip?.id])

  useEffect(() => {
    return () => {
      if (auditionRef.current) finishAudition(auditionRef.current)
    }
    // The audition manager only touches refs and the audio engine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!clip) return
    setSelectedNoteIds([])
    setPreviewNote(null)
    setDraft(null)
    setVelocityPreview(null)
    if (auditionRef.current) finishAudition(auditionRef.current)
    const id = window.setTimeout(() => {
      const scroller = scrollRef.current
      if (!scroller) return
      scroller.scrollLeft = 0
      const focusPitch = clip.notes.length
        ? clip.notes.reduce((sum, note) => sum + note.pitch, 0) / clip.notes.length
        : 60
      const rowIndex = rows.findIndex((row) => row.pitch <= focusPitch)
      const target = Math.max(
        0,
        (rowIndex < 0 ? rows.length - 1 : rowIndex) * ROW_HEIGHT - scroller.clientHeight / 2,
      )
      scroller.scrollTop = target
    }, 10)
    return () => window.clearTimeout(id)
    // Selection of a new clip should reset the view, not every note change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip?.id])

  useEffect(() => {
    if (!clip) return
    const valid = new Set(clip.notes.map((note) => note.id))
    if (selectedNoteIds.some((id) => !valid.has(id))) {
      setSelectedNoteIds(selectedNoteIds.filter((id) => valid.has(id)))
    }
  }, [clip, selectedNoteIds, setSelectedNoteIds])

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const measure = () => setAvailableWidth(container.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [clip?.id])

  useEffect(() => {
    if (!clip || !track) return
    const update = () => {
      const line = playheadRef.current
      if (!line) return
      const beat = isPlaying ? engine.getPosition() : pausedBeat
      const relative = beat - clip.start
      if (relative < 0 || relative > clip.length) {
        line.style.opacity = '0'
        return
      }
      line.style.opacity = '1'
      line.style.left = `${relative * ppb}px`
    }
    update()
    if (!isPlaying) return
    let frame = 0
    const loop = () => {
      update()
      frame = window.requestAnimationFrame(loop)
    }
    frame = window.requestAnimationFrame(loop)
    return () => window.cancelAnimationFrame(frame)
  }, [clip, isPlaying, pausedBeat, ppb, track])

  const pitchFromY = (y: number) => {
    const index = clamp(Math.floor(y / ROW_HEIGHT), 0, rows.length - 1)
    return rows[index]?.pitch ?? 60
  }

  const noteFromEvent = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const rawStart = x / ppb
    const start = clamp(Math.floor((rawStart + 1e-8) / snap) * snap, 0, Math.max(0, (clip?.length ?? 1) - snap))
    return { start, pitch: pitchFromY(y), rect, x, y }
  }

  const beginNoteMarquee = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!clip || !track || event.button !== 0) return
    const grid = gridRef.current
    if (!grid) return
    event.preventDefault()
    event.stopPropagation()
    const rect = grid.getBoundingClientRect()
    const startX = clamp(event.clientX - rect.left, 0, gridWidth)
    const startY = clamp(event.clientY - rect.top, 0, rows.length * ROW_HEIGHT)
    const additive = event.shiftKey || event.metaKey || event.ctrlKey
    const baseIds = additive ? [...selectedNoteIds] : []
    let moved = false
    let lastKey = ''

    const selectInBox = (x1: number, y1: number, x2: number, y2: number) => {
      const left = Math.min(x1, x2)
      const right = Math.max(x1, x2)
      const top = Math.min(y1, y2)
      const bottom = Math.max(y1, y2)
      const hits: string[] = []
      for (const note of clip.notes) {
        const rowIndex = rows.findIndex((row) => row.pitch === note.pitch)
        if (rowIndex < 0) continue
        const noteLeft = note.start * ppb
        const noteRight = (note.start + note.duration) * ppb
        const noteTop = rowIndex * ROW_HEIGHT
        const noteBottom = noteTop + ROW_HEIGHT
        if (
          noteRight >= left &&
          noteLeft <= right &&
          noteBottom >= top &&
          noteTop <= bottom
        ) {
          hits.push(note.id)
        }
      }
      const ids = [...new Set([...baseIds, ...hits])]
      const key = ids.join('|')
      if (key === lastKey) return
      lastKey = key
      setSelectedNoteIds(ids)
    }

    const onMove = (moveEvent: PointerEvent) => {
      const x = clamp(moveEvent.clientX - rect.left, 0, gridWidth)
      const y = clamp(moveEvent.clientY - rect.top, 0, rows.length * ROW_HEIGHT)
      if (!moved && (Math.abs(x - startX) > 3 || Math.abs(y - startY) > 3)) {
        moved = true
        document.body.classList.add('is-note-marquee-selecting')
      }
      if (!moved) return
      setNoteMarquee({ x1: startX, y1: startY, x2: x, y2: y })
      selectInBox(startX, startY, x, y)
    }

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      document.body.classList.remove('is-note-marquee-selecting')
      setNoteMarquee(null)
    }

    const onUp = () => {
      cleanup()
      if (!moved && !additive) setSelectedNoteIds([])
    }

    const onCancel = () => cleanup()
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
  }

  const handleGridPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('.pr-note')) return
    if (pianoTool === 'select' || event.shiftKey) {
      beginNoteMarquee(event)
      return
    }
    beginDraw(event)
  }

  const beginDraw = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!clip || !track || event.button !== 0) return
    if ((event.target as HTMLElement).closest('.pr-note')) return
    event.preventDefault()
    const { start, pitch, rect } = noteFromEvent(event)
    const initial: Note = {
      id: 'draft',
      pitch,
      start,
      duration: Math.min(noteLength, clip.length - start),
      velocity: 0.78,
    }
    setDraft(initial)
    setSelectedNoteIds([])
    playAudition(track, pitch, 0.78)
    let latest = initial
    const move = (moveEvent: PointerEvent) => {
      const pointerX = moveEvent.clientX - rect.left
      const end = Math.max(
        start + snap,
        Math.ceil((pointerX / ppb) / snap) * snap,
      )
      latest = {
        ...latest,
        duration: clamp(end - start, snap, clip.length - start),
      }
      setDraft(latest)
    }
    const cleanup = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      setDraft(null)
      stopAudition(140)
    }
    const up = () => {
      cleanup()
      if (latest.duration <= 0) return
      const newNote: Note = { ...latest, id: uid('n') }
      updateNotes(track.id, clip.id, [...clip.notes, newNote])
      setSelectedNoteIds([newNote.id])
    }
    const cancel = () => cleanup()
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
  }

  const beginNoteDrag = (event: ReactPointerEvent<HTMLElement>, note: Note, mode: 'move' | 'resize') => {
    if (!clip || !track || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    setSelectedNoteIds([note.id])
    playAudition(track, note.pitch, note.velocity)
    const originX = event.clientX
    const originY = event.clientY
    const startIndex = rows.findIndex((row) => row.pitch === note.pitch)
    let latest = note
    let lastPlayedPitch = note.pitch
    setPreviewNote(note)
    const move = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - originX
      const dy = moveEvent.clientY - originY
      if (mode === 'move') {
        const rawStart = note.start + dx / ppb
        const start = moveEvent.altKey
          ? Math.max(0, rawStart)
          : Math.max(0, snapBeat(rawStart, snap))
        const rowDelta = Math.round(dy / ROW_HEIGHT)
        const targetIndex = clamp((startIndex < 0 ? 0 : startIndex) + rowDelta, 0, rows.length - 1)
        const pitch = rows[targetIndex]?.pitch ?? note.pitch
        latest = {
          ...note,
          start: clamp(start, 0, Math.max(0, clip.length - note.duration)),
          pitch,
        }
      } else {
        const rawDuration = note.duration + dx / ppb
        const duration = moveEvent.altKey
          ? Math.max(0.08, rawDuration)
          : Math.max(snap, snapBeat(rawDuration, snap))
        latest = { ...note, duration: clamp(duration, snap, clip.length - note.start) }
      }
      if (latest.pitch !== lastPlayedPitch) {
        lastPlayedPitch = latest.pitch
        playAudition(track, latest.pitch, latest.velocity)
      }
      setPreviewNote(latest)
    }
    const cleanup = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      setPreviewNote(null)
      document.body.classList.remove('is-note-dragging')
      stopAudition(130)
    }
    const up = () => {
      const previous = clip.notes
      cleanup()
      if (latest.start === note.start && latest.pitch === note.pitch && latest.duration === note.duration) return
      updateNotes(
        track.id,
        clip.id,
        previous.map((item) => (item.id === note.id ? latest : item)),
      )
      setSelectedNoteIds([note.id])
    }
    const cancel = () => cleanup()
    document.body.classList.add('is-note-dragging')
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
  }

  const beginVelocityDrag = (event: ReactPointerEvent<HTMLDivElement>, note: Note) => {
    if (!clip || !track || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    setSelectedNoteIds([note.id])
    const rect = event.currentTarget.parentElement?.getBoundingClientRect()
    if (!rect) return
    const getValue = (clientY: number) =>
      clamp(1 - (clientY - rect.top - 4) / Math.max(1, rect.height - 8), 0.08, 1)
    let latest = getValue(event.clientY)
    setVelocityPreview({ noteId: note.id, value: latest })
    playAudition(track, note.pitch, latest, 500)
    const move = (moveEvent: PointerEvent) => {
      latest = getValue(moveEvent.clientY)
      setVelocityPreview({ noteId: note.id, value: latest })
    }
    const cleanup = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      setVelocityPreview(null)
      stopAudition(100)
    }
    const up = () => {
      cleanup()
      updateNotes(
        track.id,
        clip.id,
        clip.notes.map((item) => (item.id === note.id ? { ...item, velocity: Number(latest.toFixed(2)) } : item)),
      )
    }
    const cancel = () => cleanup()
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
  }

  const deleteSelectedNotes = () => {
    if (!clip || !track || !selectedNoteIds.length) return
    updateNotes(
      track.id,
      clip.id,
      clip.notes.filter((note) => !selectedNoteIds.includes(note.id)),
    )
    setSelectedNoteIds([])
    toast('Notes deleted', `${selectedNoteIds.length} note${selectedNoteIds.length === 1 ? '' : 's'} removed.`)
  }

  const applyQuantize = () => {
    if (!clip || !track) return
    const targetIds = selectedNoteIds.length ? selectedNoteIds : clip.notes.map((note) => note.id)
    const target = new Set(targetIds)
    const quantized = quantizeNotes(clip.notes, snap, clip.length)
    updateNotes(
      track.id,
      clip.id,
      clip.notes.map((note, index) => (target.has(note.id) ? quantized[index] : note)),
    )
    toast('Quantized', `${targetIds.length} note${targetIds.length === 1 ? '' : 's'} aligned to the grid.`, 'success')
  }

  const transpose = (semitones: number) => {
    if (!clip || !track || isDrumInstrument(track.instrument)) return
    const targetIds = selectedNoteIds.length ? selectedNoteIds : clip.notes.map((note) => note.id)
    const target = new Set(targetIds)
    const notes = clip.notes.map((note) =>
      target.has(note.id) ? { ...note, pitch: clamp(note.pitch + semitones, 24, 96) } : note,
    )
    updateNotes(track.id, clip.id, notes)
    const moved = notes.find((note) => target.has(note.id))
    if (moved) playAudition(track, moved.pitch, moved.velocity, 320)
  }

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    if (velocityScrollRef.current) velocityScrollRef.current.scrollLeft = event.currentTarget.scrollLeft
  }

  if (!clip || !track) {
    const fallbackTrack = project.tracks.find((item) => item.id === selectedTrackId) ?? project.tracks[0]
    return (
      <div className="piano-empty">
        <div className="piano-empty-art" aria-hidden="true">
          <span className="empty-key white" />
          <span className="empty-key black" />
          <span className="empty-key white" />
          <span className="empty-key white" />
          <span className="empty-key black" />
          <span className="empty-key white" />
          <span className="empty-note n1" />
          <span className="empty-note n2" />
          <span className="empty-note n3" />
        </div>
        <div className="piano-empty-copy">
          <span className="eyebrow">PIANO ROLL</span>
          <h3>Give an idea somewhere to live.</h3>
          <p>Select a clip to edit its notes, or start a new one on “{fallbackTrack?.name ?? 'your track'}”.</p>
        </div>
        <div className="piano-empty-actions">
          <button
            className="button button-primary"
            onClick={() => {
              if (fallbackTrack) addClipOnTrack(fallbackTrack.id)
            }}
          >
            <Plus size={15} /> New clip
          </button>
          <button className="button button-secondary" onClick={() => setDock('loops')}>
            <Library size={15} /> Browse loops
          </button>
        </div>
      </div>
    )
  }

  const selectedNoteName = selectedNote
    ? isDrumInstrument(track.instrument)
      ? DRUM_NOTE_MAP[selectedNote.pitch]?.name ?? midiToName(selectedNote.pitch)
      : midiToName(selectedNote.pitch, true)
    : null

  return (
    <div className="piano-editor" style={{ ['--track-color' as string]: track.color }}>
      <div className="piano-toolbar">
        <div className="clip-inspector">
          <span className="inspector-color" />
          <div className="inspector-title">
            <input
              className="clip-name-input"
              value={clip.name}
              onChange={(event) => updateClip(track.id, clip.id, { name: event.target.value }, { coalesce: `clip-name:${clip.id}` })}
              aria-label="Clip name"
              maxLength={40}
              spellCheck={false}
            />
            <span>
              {INSTRUMENT_MAP[track.instrument].name} · {formatBeatPosition(clip.start, project.timeSig)} · {Math.round(clip.length / project.timeSig * 100) / 100} bars
            </span>
          </div>
        </div>

        <div className="piano-tools">
          <button
            className={`editor-tool piano-tool-toggle ${pianoTool === 'select' ? 'is-on' : ''}`}
            onClick={() => setPianoTool(pianoTool === 'draw' ? 'select' : 'draw')}
            title={pianoTool === 'draw' ? 'Box select notes (Shift + drag works too)' : 'Draw notes'}
            aria-label={pianoTool === 'draw' ? 'Switch to box selection' : 'Switch to draw notes'}
            aria-pressed={pianoTool === 'select'}
          >
            {pianoTool === 'draw' ? <Pencil size={14} /> : <BoxSelect size={14} />}
            <span>{pianoTool === 'draw' ? 'Draw' : 'Select'}</span>
          </button>
          <label className="editor-select" title="Length for new notes">
            <span>NOTE</span>
            <select
              value={noteLength}
              onChange={(event) => setNoteLength(Number(event.target.value))}
              aria-label="New note length"
            >
              {NOTE_LENGTH_OPTIONS.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown size={11} />
          </label>
          <button className="editor-tool" onClick={applyQuantize} title="Quantize notes to the grid">
            <Magnet size={14} />
            <span>Quantize</span>
          </button>
          <div className="transpose-tools">
            <button
              className="editor-tool icon-only"
              onClick={() => transpose(-1)}
              disabled={isDrumInstrument(track.instrument)}
              title="Transpose down one semitone"
              aria-label="Transpose down one semitone"
            >
              <ArrowDown size={14} />
            </button>
            <span className="tool-label">PITCH</span>
            <button
              className="editor-tool icon-only"
              onClick={() => transpose(1)}
              disabled={isDrumInstrument(track.instrument)}
              title="Transpose up one semitone"
              aria-label="Transpose up one semitone"
            >
              <ArrowUp size={14} />
            </button>
          </div>
          <button
            className="editor-tool icon-only danger-hover"
            onClick={deleteSelectedNotes}
            disabled={!selectedNoteIds.length}
            title="Delete selected notes"
            aria-label="Delete selected notes"
          >
            <Trash2 size={14} />
          </button>
          <button
            className="editor-tool icon-only piano-clipboard-action"
            onClick={() => copySelectedNotes()}
            disabled={!selectedNoteIds.length}
            title="Copy selected notes (Ctrl/⌘ + C)"
            aria-label="Copy selected notes"
          >
            <Copy size={14} />
          </button>
          <button
            className="editor-tool icon-only piano-clipboard-action"
            onClick={() => pasteClipboard('notes')}
            title="Paste notes at the playhead (Ctrl/⌘ + V)"
            aria-label="Paste notes at the playhead"
          >
            <ClipboardPaste size={14} />
          </button>
          <div className="piano-zoom" role="group" aria-label="Piano roll zoom">
            <button
              className="editor-tool icon-only"
              onClick={() => zoomAtPoint(stepZoom(-1))}
              disabled={pianoZoom <= MIN_PIANO_ZOOM}
              title="Zoom out (Ctrl/⌘ + scroll)"
              aria-label="Zoom out"
            >
              <ZoomOut size={14} />
            </button>
            <button
              className="piano-zoom-value"
              onClick={() => zoomAtPoint(MIN_PIANO_ZOOM)}
              title="Fit clip to width (Ctrl/⌘ + scroll to zoom)"
              aria-label={`Piano roll zoom ${Math.round(pianoZoom * 100)} percent. Click to fit.`}
            >
              {Math.round(pianoZoom * 100)}%
            </button>
            <button
              className="editor-tool icon-only"
              onClick={() => zoomAtPoint(stepZoom(1))}
              disabled={pianoZoom >= MAX_PIANO_ZOOM}
              title="Zoom in (Ctrl/⌘ + scroll)"
              aria-label="Zoom in"
            >
              <ZoomIn size={14} />
            </button>
          </div>
        </div>

        <div className="piano-status">
          {selectedNote && selectedNoteName ? (
            <>
              <span className="selected-note-name">{selectedNoteName}</span>
              <span className="piano-status-divider" />
              <span>VEL {Math.round((velocityPreview?.value ?? selectedNote.velocity) * 127)}</span>
              <span className="piano-status-divider" />
              <span>{Math.round(selectedNote.duration * 100) / 100} beats</span>
            </>
          ) : (
            <>
              <Grid2X2 size={13} />
              <span>{clip.notes.length} notes</span>
              <span className="piano-status-divider" />
              <span>Grid {NOTE_LENGTH_OPTIONS.find((option) => option.value === snap)?.label ?? '1/16'}</span>
            </>
          )}
        </div>
      </div>

      <div className="piano-main">
        <div className="pr-scroll" ref={scrollRef} onScroll={handleScroll}>
          <div className="pr-inner" style={{ width: contentWidth }}>
            <div className="pr-ruler" style={{ width: contentWidth }}>
              <div className="pr-ruler-corner">BEAT</div>
              <div className="pr-ruler-bars" style={{ width: gridWidth, ['--ppb' as string]: `${ppb}px` }}>
                {Array.from({ length: Math.ceil(clip.length / project.timeSig) + 1 }, (_, index) => (
                  <div
                    key={index}
                    className="pr-bar-mark"
                    style={{ left: index * project.timeSig * ppb }}
                  >
                    <span>{Math.floor(clip.start / project.timeSig) + index + 1}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="pr-body" style={{ height: rows.length * ROW_HEIGHT }}>
              <div className="pr-labels" style={{ width: LABEL_WIDTH, height: rows.length * ROW_HEIGHT }}>
                {rows.map((row) => (
                  <div
                    key={row.pitch}
                    className={`pr-label ${row.black ? 'is-black' : ''} ${row.cRow ? 'is-c' : ''}`}
                    style={{ height: ROW_HEIGHT }}
                    onClick={() => playAudition(track, row.pitch, 0.8, 340)}
                  >
                    <span>{row.name}</span>
                  </div>
                ))}
              </div>
              <div
                className="pr-grid"
                ref={gridRef}
                style={{
                  width: gridWidth,
                  height: rows.length * ROW_HEIGHT,
                  ['--ppb' as string]: `${ppb}px`,
                  ['--row-h' as string]: `${ROW_HEIGHT}px`,
                }}
                onPointerDown={handleGridPointerDown}
                onContextMenu={(event) => event.preventDefault()}
              >
                <div className="pr-row-bg" aria-hidden="true">
                  {rows.map((row, index) => (
                    <div
                      key={row.pitch}
                      className={`pr-grid-row ${row.black ? 'is-black' : ''} ${row.cRow ? 'is-c' : ''}`}
                      style={{ top: index * ROW_HEIGHT, height: ROW_HEIGHT }}
                    />
                  ))}
                </div>
                <div className="pr-grid-lines" aria-hidden="true" />
                {displayNotes.map((note) => {
                  const rowIndex = rows.findIndex((row) => row.pitch === note.pitch)
                  if (rowIndex < 0) return null
                  const left = note.start * ppb
                  const width = Math.max(5, note.duration * ppb)
                  const isSelected = selectedNoteIds.includes(note.id)
                  const isDraft = note.id === 'draft'
                  return (
                    <div
                      key={note.id}
                      className={`pr-note ${isSelected ? 'is-selected' : ''} ${isDraft ? 'is-draft' : ''}`}
                      style={{
                        left,
                        top: rowIndex * ROW_HEIGHT + 2,
                        width,
                        height: ROW_HEIGHT - 4,
                        background: track.color,
                      }}
                      onPointerDown={(event) => {
                        if (isDraft) return
                        beginNoteDrag(event, note, 'move')
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        if (!isDraft) {
                          updateNotes(track.id, clip.id, clip.notes.filter((item) => item.id !== note.id))
                          setSelectedNoteIds([])
                        }
                      }}
                    >
                      {width > 36 && (
                        <span className="pr-note-label">
                          {isDrumInstrument(track.instrument)
                            ? DRUM_NOTE_MAP[note.pitch]?.short ?? ''
                            : midiToName(note.pitch, true)}
                        </span>
                      )}
                      {isSelected && !isDraft && (
                        <span
                          className="pr-note-resize"
                          onPointerDown={(event) => {
                            event.stopPropagation()
                            beginNoteDrag(event, note, 'resize')
                          }}
                        />
                      )}
                    </div>
                  )
                })}
                {noteMarquee && (
                  <div
                    className="pr-marquee"
                    style={{
                      left: Math.min(noteMarquee.x1, noteMarquee.x2),
                      top: Math.min(noteMarquee.y1, noteMarquee.y2),
                      width: Math.abs(noteMarquee.x2 - noteMarquee.x1),
                      height: Math.abs(noteMarquee.y2 - noteMarquee.y1),
                    }}
                    aria-hidden="true"
                  />
                )}
                <div className="piano-playhead" ref={playheadRef} aria-hidden="true" />
              </div>
            </div>
          </div>
        </div>

        <div className="velocity-lane">
          <div className="velocity-label">
            <span>VELOCITY</span>
            <strong>{selectedNote ? Math.round((velocityPreview?.value ?? selectedNote.velocity) * 127) : '—'}</strong>
          </div>
          <div className="velocity-scroll" ref={velocityScrollRef}>
            <div
              className="velocity-inner"
              style={{ width: gridWidth, ['--ppb' as string]: `${ppb}px` }}
            >
              <div className="velocity-grid" aria-hidden="true" />
              {displayNotes
                .filter((note) => note.id !== 'draft' || true)
                .map((note) => {
                  const value = velocityPreview?.noteId === note.id ? velocityPreview.value : note.velocity
                  return (
                    <div
                      key={note.id}
                      className={`velocity-bar ${selectedNoteIds.includes(note.id) ? 'is-selected' : ''} ${note.id === 'draft' ? 'is-draft' : ''}`}
                      style={{
                        left: Math.max(0, note.start * ppb),
                        height: `${Math.max(4, value * 32)}px`,
                      }}
                      onPointerDown={(event) => {
                        if (note.id === 'draft') return
                        beginVelocityDrag(event, note)
                      }}
                      title={`Velocity ${Math.round(value * 127)}`}
                    />
                  )
                })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
