import { useEffect, useRef, type CSSProperties } from 'react'
import { engine } from '../audio/engine'
import { useProjectStore } from '../store/project'
import { useSessionStore } from '../store/session'
import { toggleMute, toggleSolo } from '../lib/transport'
import { clamp, gainToDb } from '../lib/utils'
import type { Track } from '../types'
import { TrackIcon } from '../components/TrackIcon'
import { useMobileStore } from './store'

const dbLabel = (value: number) => (value <= 0.001 ? '−∞' : `${gainToDb(value).toFixed(1)}`.replace('-', '−'))

function Fader({
  value,
  color,
  onChange,
  level,
  label,
}: {
  value: number
  color: string
  onChange: (value: number) => void
  level: (element: HTMLElement) => void
  label: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const meterRef = useRef<HTMLDivElement>(null)
  const levelRef = useRef(level)
  levelRef.current = level

  useEffect(() => {
    let frame = 0
    const loop = () => {
      if (meterRef.current) levelRef.current(meterRef.current)
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [])

  const setFromPointer = (clientY: number) => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    // Leave room for the thumb at both ends so the travel feels even.
    const pad = 16
    const travel = Math.max(1, rect.height - pad * 2)
    onChange(clamp(1 - (clientY - rect.top - pad) / travel, 0, 1))
  }

  return (
    <div
      className="m-fader"
      ref={ref}
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      tabIndex={0}
      style={{ '--c': color, '--v': value } as CSSProperties}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        setFromPointer(event.clientY)
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) setFromPointer(event.clientY)
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowUp') onChange(clamp(value + 0.02, 0, 1))
        if (event.key === 'ArrowDown') onChange(clamp(value - 0.02, 0, 1))
      }}
    >
      <div className="m-fader-rail">
        <div className="m-fader-meter" ref={meterRef} />
        <div className="m-fader-fill" />
      </div>
      <div className="m-fader-thumb" />
    </div>
  )
}

function Strip({ track, selected }: { track: Track; selected: boolean }) {
  const updateTrack = useProjectStore((state) => state.updateTrack)
  const selectTrack = useProjectStore((state) => state.selectTrack)
  const setTrackSheetId = useMobileStore((state) => state.setTrackSheetId)
  return (
    <section className={`m-strip ${selected ? 'is-selected' : ''} ${track.mute ? 'is-muted' : ''}`} style={{ '--c': track.color } as CSSProperties}>
      <button
        className="m-strip-name"
        onClick={() => {
          if (selected) setTrackSheetId(track.id)
          else selectTrack(track.id)
        }}
        aria-label={`${track.name}. ${selected ? 'Open settings' : 'Select'}`}
      >
        <TrackIcon instrument={track.instrument} size={16} />
        <span>{track.name}</span>
      </button>
      <label className="m-pan">
        <span>{Math.abs(track.pan) < 0.02 ? 'C' : `${track.pan < 0 ? 'L' : 'R'}${Math.round(Math.abs(track.pan) * 100)}`}</span>
        <input
          type="range"
          min={-1}
          max={1}
          step={0.02}
          value={track.pan}
          aria-label={`${track.name} pan`}
          onChange={(event) => {
            const pan = Number(event.target.value)
            updateTrack(track.id, { pan: Math.abs(pan) < 0.06 ? 0 : pan }, { coalesce: `mix-pan:${track.id}` })
          }}
        />
      </label>
      <Fader
        value={track.volume}
        color={track.color}
        label={`${track.name} volume`}
        onChange={(volume) => updateTrack(track.id, { volume }, { coalesce: `mix-vol:${track.id}` })}
        level={(element) => {
          const level = engine.getTrackLevel(track.id)
          const rms = Math.min(1, Math.pow(level.rms * 5.5, 0.62))
          element.style.transform = `scaleY(${rms.toFixed(3)})`
        }}
      />
      <output className="m-db">{dbLabel(track.volume)}</output>
      <div className="m-strip-ms">
        <button className={track.mute ? 'is-mute' : ''} onClick={() => toggleMute(track.id)} aria-pressed={track.mute} aria-label={`Mute ${track.name}`}>
          M
        </button>
        <button className={track.solo ? 'is-solo' : ''} onClick={() => toggleSolo(track.id)} aria-pressed={track.solo} aria-label={`Solo ${track.name}`}>
          S
        </button>
      </div>
    </section>
  )
}

function MasterStrip() {
  const master = useProjectStore((state) => state.project.master)
  const updateProject = useProjectStore((state) => state.updateProject)
  const set = (patch: Partial<typeof master>, key: string) =>
    updateProject({ master: { ...master, ...patch } }, { coalesce: `master-${key}` })
  return (
    <section className="m-strip m-strip-master" style={{ '--c': '#f2a679' } as CSSProperties}>
      <div className="m-strip-name is-static">
        <span>Master</span>
      </div>
      <label className="m-pan">
        <span>Verb</span>
        <input type="range" min={0} max={0.6} step={0.01} value={master.reverb} aria-label="Master reverb" onChange={(event) => set({ reverb: Number(event.target.value) }, 'reverb')} />
      </label>
      <Fader
        value={master.volume}
        color="#f2a679"
        label="Master volume"
        onChange={(volume) => set({ volume }, 'volume')}
        level={(element) => {
          const level = engine.getMasterLevel()
          const rms = Math.min(1, Math.pow(level.rms * 5.5, 0.62))
          element.style.transform = `scaleY(${rms.toFixed(3)})`
        }}
      />
      <output className="m-db">{dbLabel(master.volume)}</output>
      <label className="m-pan m-pan-bottom">
        <span>Echo</span>
        <input type="range" min={0} max={0.5} step={0.01} value={master.delay} aria-label="Master echo" onChange={(event) => set({ delay: Number(event.target.value) }, 'delay')} />
      </label>
    </section>
  )
}

export function MixerView() {
  const tracks = useProjectStore((state) => state.project.tracks)
  const selectedTrackId = useProjectStore((state) => state.selectedTrackId)
  const isPlaying = useSessionStore((state) => state.isPlaying)
  return (
    <div className={`m-mixer ${isPlaying ? 'is-playing' : ''}`}>
      <div className="m-mixer-strips">
        {tracks.map((track) => (
          <Strip key={track.id} track={track} selected={track.id === selectedTrackId} />
        ))}
      </div>
      <MasterStrip />
    </div>
  )
}
