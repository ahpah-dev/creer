import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Copy, Eraser, MoreHorizontal, Trash2, Volume2, X } from 'lucide-react'
import type { Track } from '../types'
import { INSTRUMENT_MAP } from '../data/instruments'
import { useProjectStore } from '../store/project'
import { useSessionStore } from '../store/session'
import { setArmedTrack } from '../lib/transport'
import { MOD_LABEL, TRACK_COLORS, deepClone, uid } from '../lib/utils'
import { TrackIcon } from './TrackIcon'

interface TrackHeaderProps {
  track: Track
  index: number
  selected: boolean
  dimmed?: boolean
  onSelect: (trackId: string) => void
}

interface MenuPosition {
  x: number
  y: number
}

export function TrackHeader({ track, index, selected, dimmed, onSelect }: TrackHeaderProps) {
  const updateTrack = useProjectStore((state) => state.updateTrack)
  const removeTrack = useProjectStore((state) => state.removeTrack)
  const apply = useProjectStore((state) => state.apply)
  const trackCount = useProjectStore((state) => state.project.tracks.length)
  const selectTrack = useProjectStore((state) => state.selectTrack)
  const toast = useSessionStore((state) => state.toast)
  const [menu, setMenu] = useState<MenuPosition | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  const volume = Math.round(track.volume * 100)
  const pan = Math.round(track.pan * 100)
  const info = INSTRUMENT_MAP[track.instrument]

  useEffect(() => {
    if (!menu) return
    const close = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node) || moreRef.current?.contains(event.target as Node)) return
      setMenu(null)
    }
    const closeNow = () => setMenu(null)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null)
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('resize', closeNow)
    window.addEventListener('scroll', closeNow, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('resize', closeNow)
      window.removeEventListener('scroll', closeNow, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const openMenu = () => {
    if (menu) {
      setMenu(null)
      return
    }
    const rect = moreRef.current?.getBoundingClientRect()
    if (!rect) return
    const width = 206
    const height = 238
    const x = Math.max(10, Math.min(rect.left - width + 34, window.innerWidth - width - 10))
    const y = rect.bottom + 7 + height > window.innerHeight ? Math.max(10, rect.top - height - 4) : rect.bottom + 7
    setMenu({ x, y })
  }

  const duplicate = () => {
    const copy = deepClone(track)
    copy.id = uid('t')
    copy.name = `${track.name} copy`
    copy.armed = false
    copy.clips = copy.clips.map((clip) => ({
      ...clip,
      id: uid('c'),
      name: clip.name,
      notes: clip.notes.map((note) => ({ ...note, id: uid('n') })),
    }))
    apply((project) => {
      const tracks = [...project.tracks]
      const at = tracks.findIndex((item) => item.id === track.id)
      tracks.splice(at + 1, 0, copy)
      return { ...project, tracks }
    })
    selectTrack(copy.id, copy.clips[0]?.id ?? null)
    toast('Track duplicated', `"${copy.name}" is ready.`)
    setMenu(null)
  }

  const clear = () => {
    updateTrack(track.id, { clips: [] })
    if (useProjectStore.getState().selectedTrackId === track.id) {
      useProjectStore.setState({ selectedClipId: null })
      useSessionStore.getState().setSelectedNoteIds([])
    }
    toast('Track cleared', `All clips were removed from "${track.name}".`)
    setMenu(null)
  }

  const remove = () => {
    if (trackCount <= 1) {
      toast('Keep at least one track', 'Add another track before removing this one.', 'warn')
      setMenu(null)
      return
    }
    removeTrack(track.id)
    toast('Track removed', `"${track.name}" was deleted. ${MOD_LABEL}Z brings it back.`)
    setMenu(null)
  }

  return (
    <div
      className={`track-head ${selected ? 'is-selected' : ''} ${track.mute ? 'is-muted' : ''} ${dimmed ? 'is-solo-muted' : ''}`}
      style={{ '--track-color': track.color } as CSSProperties}
      onClick={() => onSelect(track.id)}
      data-track-head={track.id}
    >
      <span className="track-color-rail" />
      <div className="track-row-one">
        <span className="track-index">{String(index + 1).padStart(2, '0')}</span>
        <span className="track-icon" title={info.name}>
          <TrackIcon instrument={track.instrument} size={14} />
        </span>
        <input
          className="track-name-input"
          value={track.name}
          onChange={(event) => updateTrack(track.id, { name: event.target.value }, { coalesce: `track-name:${track.id}` })}
          onBlur={() => {
            if (!track.name.trim()) updateTrack(track.id, { name: info.name }, { history: false })
          }}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          aria-label={`Track name, ${track.name}`}
          maxLength={32}
          spellCheck={false}
        />
        <button
          className={`arm-button ${track.armed ? 'is-armed' : ''}`}
          onClick={(event) => {
            event.stopPropagation()
            setArmedTrack(track.id)
          }}
          aria-label={track.armed ? 'Disarm track' : 'Arm track for recording'}
          data-tip={track.armed ? 'Armed for recording' : 'Arm for recording'}
        >
          <span />
        </button>
        <button
          ref={moreRef}
          className={`track-more ${menu ? 'is-open' : ''}`}
          onClick={(event) => {
            event.stopPropagation()
            openMenu()
          }}
          aria-label={`More actions for ${track.name}`}
          data-tip="Track actions"
        >
          <MoreHorizontal size={15} />
        </button>
      </div>
      <div className="track-row-two" onPointerDown={(event) => event.stopPropagation()}>
        <button
          className={`ms-button ${track.mute ? 'is-mute' : ''}`}
          onClick={() => updateTrack(track.id, { mute: !track.mute })}
          aria-label={track.mute ? 'Unmute track' : 'Mute track'}
          aria-pressed={track.mute}
        >
          M
        </button>
        <button
          className={`ms-button ${track.solo ? 'is-solo' : ''}`}
          onClick={() => updateTrack(track.id, { solo: !track.solo })}
          aria-label={track.solo ? 'Unsolo track' : 'Solo track'}
          aria-pressed={track.solo}
        >
          S
        </button>
        <label className="mini-slider volume-slider" title={`Volume ${volume}%`}>
          <Volume2 size={12} />
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={(event) =>
              updateTrack(track.id, { volume: Number(event.target.value) / 100 }, { coalesce: `volume:${track.id}` })
            }
            onDoubleClick={() => updateTrack(track.id, { volume: 0.75 })}
            aria-label={`${track.name} volume`}
            style={{ ['--fill' as string]: `${volume}%` }}
          />
        </label>
        <label className="mini-slider pan-slider" title={`Pan ${pan === 0 ? 'center' : pan < 0 ? `${Math.abs(pan)}% left` : `${pan}% right`}`}>
          <span className="pan-ticks" aria-hidden="true">
            <i />
          </span>
          <input
            type="range"
            min={-100}
            max={100}
            value={pan}
            onChange={(event) =>
              updateTrack(track.id, { pan: Number(event.target.value) / 100 }, { coalesce: `pan:${track.id}` })
            }
            onDoubleClick={() => updateTrack(track.id, { pan: 0 })}
            aria-label={`${track.name} pan`}
            style={{ ['--pan-fill' as string]: `${(pan + 100) / 2}%` }}
          />
        </label>
      </div>

      {menu &&
        createPortal(
          <div
            className="track-menu popover"
            ref={menuRef}
            style={{ left: menu.x, top: menu.y, width: 206 }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="track-menu-head">
              <div>
                <span className="field-label">TRACK</span>
                <strong>{track.name}</strong>
              </div>
              <button className="icon-button mini" onClick={() => setMenu(null)} aria-label="Close menu">
                <X size={13} />
              </button>
            </div>
            <button className="menu-item" onClick={duplicate}>
              <Copy size={14} /> Duplicate track
            </button>
            <button className="menu-item" onClick={clear} disabled={!track.clips.length}>
              <Eraser size={14} /> Clear all clips
            </button>
            <div className="menu-divider" />
            <div className="color-picker-row">
              <span className="field-label">COLOR</span>
              <div className="color-swatches">
                {TRACK_COLORS.map((color) => (
                  <button
                    key={color.value}
                    className={`color-swatch ${track.color === color.value ? 'is-active' : ''}`}
                    style={{ background: color.value }}
                    onClick={() => updateTrack(track.id, { color: color.value })}
                    aria-label={`Set track color to ${color.name}`}
                    title={color.name}
                  />
                ))}
              </div>
            </div>
            <div className="menu-divider" />
            <button className="menu-item is-danger" onClick={remove} disabled={trackCount <= 1}>
              <Trash2 size={14} /> Delete track
            </button>
          </div>,
          document.body,
        )}
    </div>
  )
}
