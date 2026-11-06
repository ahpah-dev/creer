import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import type { Clip, Track } from '../types'
import { INSTRUMENT_MAP } from '../data/instruments'
import { clipNoteRange } from '../lib/utils'

interface ClipViewProps {
  clip: Clip
  track: Track
  width: number
  selected: boolean
  ghost?: boolean
  onPointerDown?: (event: ReactPointerEvent<HTMLDivElement>, mode: 'move' | 'resize-right') => void
  onDoubleClick?: () => void
}

export function ClipView({
  clip,
  track,
  width,
  selected,
  ghost = false,
  onPointerDown,
  onDoubleClick,
}: ClipViewProps) {
  const info = INSTRUMENT_MAP[track.instrument]
  const range = track.instrument === 'drums' ? { min: 34, max: 54 } : clipNoteRange(clip)
  const span = Math.max(12, range.max - range.min + 1)
  const notes = clip.notes
    .filter((note) => note.start < clip.length - 0.001)
    .map((note) => {
      const noteWidth = Math.max(0.55, Math.min(note.duration, clip.length - note.start) / clip.length * 100)
      const left = (note.start / clip.length) * 100
      const top = Math.max(0, Math.min(92, 96 - ((note.pitch - range.min) / span) * 88))
      return { ...note, noteWidth, left, top }
    })

  const style = {
    '--clip-color': track.color,
    '--clip-width': `${width}px`,
  } as CSSProperties

  return (
    <div
      className={`clip ${selected ? 'is-selected' : ''} ${ghost ? 'is-ghost' : ''} ${width < 92 ? 'is-narrow' : ''}`}
      style={style}
      onPointerDown={(event) => onPointerDown?.(event, 'move')}
      onDoubleClick={(event) => {
        event.stopPropagation()
        onDoubleClick?.()
      }}
      data-clip-id={clip.id}
      role="button"
      tabIndex={-1}
      aria-label={`${clip.name}, ${info.name} clip`}
      title={`${clip.name} — ${info.name}`}
    >
      <div className="clip-top">
        <span className="clip-grip" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="clip-name">{clip.name}</span>
        <span className="clip-instrument">{info.shortName}</span>
      </div>
      <div className="clip-note-field">
        <svg
          className="clip-notes"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {notes.map((note) => (
            <rect
              key={note.id}
              x={note.left}
              y={note.top}
              width={note.noteWidth}
              height={Math.max(2.4, 6.5 - (span > 30 ? 2 : 0))}
              rx={0.7}
              opacity={0.22 + note.velocity * 0.48}
            />
          ))}
        </svg>
        <div className="clip-sheen" aria-hidden="true" />
      </div>
      {selected && <span className="clip-selected-mark" aria-hidden="true" />}
      <div
        className="clip-resize-handle"
        onPointerDown={(event) => {
          event.stopPropagation()
          onPointerDown?.(event, 'resize-right')
        }}
        onDoubleClick={(event) => event.stopPropagation()}
        aria-hidden="true"
      />
    </div>
  )
}
