import { useEffect, useRef } from 'react'
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import { Wand2 } from 'lucide-react'
import { INSTRUMENT_MAP } from '../data/instruments'
import { engine } from '../audio/engine'
import { useProjectStore } from '../store/project'
import { useSessionStore } from '../store/session'
import { clamp, gainToDb } from '../lib/utils'
import type { Track } from '../types'

function formatDb(value: number) {
  if (value <= 0.001) return '−∞'
  return `${gainToDb(value).toFixed(1)}`
}

function formatPan(value: number) {
  if (Math.abs(value) < 0.01) return 'C'
  return `${value < 0 ? 'L' : 'R'}${Math.abs(Math.round(value * 100))}`
}

export function Knob({
  value,
  min = 0,
  max = 1,
  label,
  format,
  color,
  onChange,
  defaultValue = 0,
}: {
  value: number
  min?: number
  max?: number
  label: string
  format?: (value: number) => string
  color?: string
  onChange: (value: number) => void
  defaultValue?: number
}) {
  const dragRef = useRef<{ startY: number; start: number } | null>(null)
  const normalized = (value - min) / (max - min)
  const angle = -132 + normalized * 264
  const display = format ? format(value) : Math.round(value * 100).toString()

  const updateFromDelta = (deltaY: number) => {
    const drag = dragRef.current
    if (!drag) return
    const next = clamp(drag.start - (deltaY / 110) * (max - min), min, max)
    onChange(next)
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    dragRef.current = { startY: event.clientY, start: value }
    const move = (moveEvent: PointerEvent) => updateFromDelta(moveEvent.clientY - dragRef.current!.startY)
    const up = () => {
      dragRef.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.classList.remove('is-knob-dragging')
    }
    document.body.classList.add('is-knob-dragging')
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
      event.preventDefault()
      onChange(clamp(value + (max - min) / 20, min, max))
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
      event.preventDefault()
      onChange(clamp(value - (max - min) / 20, min, max))
    }
  }

  return (
    <div className="knob-control" title={`${label}: ${display}`}>
      <div
        className="knob"
        style={{ '--knob-angle': `${angle}deg`, '--knob-color': color ?? 'var(--accent)' } as CSSProperties}
        onPointerDown={onPointerDown}
        onDoubleClick={() => onChange(defaultValue)}
        onKeyDown={onKeyDown}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Number(value.toFixed(2))}
      >
        <span className="knob-marker" />
        <span className="knob-center" />
      </div>
      <span className="knob-label">{label}</span>
      <span className="knob-value">{display}</span>
    </div>
  )
}

function Fader({
  value,
  onChange,
  ariaLabel,
  color,
  disabled,
}: {
  value: number
  onChange: (value: number) => void
  ariaLabel: string
  color?: string
  disabled?: boolean
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const update = (clientY: number) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return
    onChange(clamp(1 - (clientY - rect.top) / rect.height, 0, 1))
  }
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || disabled) return
    event.preventDefault()
    update(event.clientY)
    const move = (moveEvent: PointerEvent) => update(moveEvent.clientY)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.classList.remove('is-fader-dragging')
    }
    document.body.classList.add('is-fader-dragging')
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      onChange(clamp(value + 0.02, 0, 1))
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      onChange(clamp(value - 0.02, 0, 1))
    }
  }
  return (
    <div className="fader-control">
      <div
        className="fader-track"
        ref={trackRef}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
        role="slider"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        style={{ '--fader-color': color ?? 'var(--accent)' } as CSSProperties}
      >
        <div className="fader-ruler" aria-hidden="true">
          {Array.from({ length: 7 }, (_, index) => (
            <span key={index} style={{ bottom: `${(index / 6) * 100}%` }} />
          ))}
        </div>
        <div className="fader-fill" style={{ height: `${value * 100}%` }} />
        <div className="fader-thumb" style={{ bottom: `${value * 100}%` }}>
          <i />
          <i />
          <i />
        </div>
      </div>
      <span className="fader-readout">{formatDb(value)} <em>dB</em></span>
    </div>
  )
}

function ChannelMeter({ trackId }: { trackId: string | null }) {
  const leftRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let frame = 0
    let last = 0
    const tick = (time: number) => {
      if (time - last > 48) {
        const level = trackId ? engine.getTrackLevel(trackId) : engine.getMasterLevel()
        const rms = Math.min(1, Math.pow(level.rms * 5.5, 0.62))
        const peak = Math.min(1, Math.pow(level.peak * 1.25, 0.7))
        if (leftRef.current) leftRef.current.style.clipPath = `inset(${Math.max(0, 100 - peak * 100)}% 0 0 0)`
        if (rightRef.current) rightRef.current.style.clipPath = `inset(${Math.max(0, 100 - rms * 100)}% 0 0 0)`
        last = time
      }
      frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [trackId])

  return (
    <div className={`channel-meter ${trackId ? '' : 'is-master'}`} aria-hidden="true">
      <div className="meter-bar">
        <div className="meter-gradient" ref={leftRef} />
      </div>
      <div className="meter-bar">
        <div className="meter-gradient" ref={rightRef} />
      </div>
    </div>
  )
}

function ChannelStrip({ track, index }: { track: Track; index: number }) {
  const updateTrack = useProjectStore((state) => state.updateTrack)
  const selectTrack = useProjectStore((state) => state.selectTrack)
  const selectedTrackId = useProjectStore((state) => state.selectedTrackId)
  const setDock = useSessionStore((state) => state.setDock)
  const setEffectsTarget = useSessionStore((state) => state.setEffectsTarget)
  const info = INSTRUMENT_MAP[track.instrument]

  const focusTrack = () => {
    const store = useProjectStore.getState()
    const clip = track.clips.find((item) => item.id === store.selectedClipId) ?? track.clips[0]
    selectTrack(track.id, clip?.id ?? null)
  }

  const openEffects = () => {
    focusTrack()
    setEffectsTarget('track')
    setDock('effects')
  }

  return (
    <div
      className={`channel-strip ${selectedTrackId === track.id ? 'is-selected' : ''}`}
      style={{ '--track-color': track.color } as CSSProperties}
      onClick={focusTrack}
    >
      <span className="channel-color" />
      <div className="channel-head">
        <div className="channel-number">{String(index + 1).padStart(2, '0')}</div>
        <div className="channel-name-wrap">
          <span className="channel-name">{track.name}</span>
          <span className="channel-instrument">{info.shortName}</span>
        </div>
        <button
          className={`channel-arm ${track.armed ? 'is-armed' : ''}`}
          onClick={(event) => {
            event.stopPropagation()
            const store = useProjectStore.getState()
            store.apply((project) => ({
              ...project,
              tracks: project.tracks.map((item) => ({ ...item, armed: item.id === track.id ? !track.armed : false })),
            }))
          }}
          aria-label={track.armed ? 'Disarm track' : 'Arm track'}
          title={track.armed ? 'Armed' : 'Arm for recording'}
        />
      </div>
      <div className="channel-knobs" onPointerDown={(event) => event.stopPropagation()}>
        <Knob
          label="PAN"
          value={track.pan}
          min={-1}
          max={1}
          defaultValue={0}
          format={formatPan}
          color={track.color}
          onChange={(value) => updateTrack(track.id, { pan: value }, { coalesce: `mix-pan:${track.id}` })}
        />
        <Knob
          label="REV"
          value={track.reverbSend}
          max={0.8}
          defaultValue={0.12}
          format={(value) => Math.round(value * 100).toString()}
          color="#9a96d7"
          onChange={(value) => updateTrack(track.id, { reverbSend: value }, { coalesce: `mix-rev:${track.id}` })}
        />
        <Knob
          label="DLY"
          value={track.delaySend}
          max={0.6}
          defaultValue={0.05}
          format={(value) => Math.round(value * 100).toString()}
          color="#7fb2ae"
          onChange={(value) => updateTrack(track.id, { delaySend: value }, { coalesce: `mix-dly:${track.id}` })}
        />
      </div>
      <div className="channel-amp" onPointerDown={(event) => event.stopPropagation()}>
        <Fader
          value={track.volume}
          ariaLabel={`${track.name} volume`}
          color={track.color}
          onChange={(value) => updateTrack(track.id, { volume: value }, { coalesce: `mix-vol:${track.id}` })}
        />
        <ChannelMeter trackId={track.id} />
      </div>
      <div className="channel-footer" onPointerDown={(event) => event.stopPropagation()}>
        <button
          className={`ms-button ${track.mute ? 'is-mute' : ''}`}
          onClick={() => updateTrack(track.id, { mute: !track.mute })}
          aria-label={track.mute ? 'Unmute track' : 'Mute track'}
        >
          M
        </button>
        <button
          className={`ms-button ${track.solo ? 'is-solo' : ''}`}
          onClick={() => updateTrack(track.id, { solo: !track.solo })}
          aria-label={track.solo ? 'Unsolo track' : 'Solo track'}
        >
          S
        </button>
        <button
          className={`channel-fx ${track.effects.length ? 'has-fx' : ''}`}
          onClick={(event) => {
            event.stopPropagation()
            openEffects()
          }}
          aria-label={`Open effects for ${track.name}`}
          title="Open the effect chain"
        >
          <Wand2 size={9} />
          <span>FX</span>
          <b>{track.effects.length}</b>
        </button>
        <span className="channel-type">{info.category.toUpperCase()}</span>
      </div>
    </div>
  )
}

export function Mixer() {
  const project = useProjectStore((state) => state.project)
  const updateProject = useProjectStore((state) => state.updateProject)
  const toast = useSessionStore((state) => state.toast)
  const setDock = useSessionStore((state) => state.setDock)
  const setEffectsTarget = useSessionStore((state) => state.setEffectsTarget)

  return (
    <div className="mixer">
      <div className="mixer-scroll">
        {project.tracks.map((track, index) => (
          <ChannelStrip key={track.id} track={track} index={index} />
        ))}
        <button
          className="mixer-add-track"
          onClick={() => useSessionStore.getState().setModal('addTrack')}
          aria-label="Add another track"
        >
          <span>+</span>
          <em>Add track</em>
        </button>
      </div>
      <div className="master-strip" style={{ '--track-color': 'var(--accent)' } as CSSProperties}>
        <div className="master-head">
          <span className="field-label">OUTPUT</span>
          <strong>Master</strong>
          <em>Stereo out</em>
        </div>
        <div className="master-knobs">
          <Knob
            label="REVERB"
            value={project.master.reverb}
            defaultValue={0.28}
            format={(value) => Math.round(value * 100).toString()}
            color="#9a96d7"
            onChange={(value) => updateProject({ master: { ...project.master, reverb: value } }, { coalesce: 'master-reverb' })}
          />
          <Knob
            label="DELAY"
            value={project.master.delay}
            defaultValue={0.16}
            format={(value) => Math.round(value * 100).toString()}
            color="#7fb2ae"
            onChange={(value) => updateProject({ master: { ...project.master, delay: value } }, { coalesce: 'master-delay' })}
          />
        </div>
        <div className="master-amp">
          <Fader
            value={project.master.volume}
            ariaLabel="Master volume"
            color="#f2a679"
            onChange={(value) => updateProject({ master: { ...project.master, volume: value } }, { coalesce: 'master-volume' })}
          />
          <ChannelMeter trackId={null} />
        </div>
        <div className="master-footer">
          <span className="limiter-pill"><i /> LIMITER</span>
          <button
            className={`master-fx ${project.master.effects.length ? 'has-fx' : ''}`}
            onClick={() => {
              setEffectsTarget('master')
              setDock('effects')
            }}
            aria-label="Open master effects"
            title="Open the master effect chain"
          >
            <Wand2 size={9} /> FX <b>{project.master.effects.length}</b>
          </button>
          <button
            className="master-reset"
            onClick={() => {
              updateProject({ master: { ...project.master, volume: 0.8, reverb: 0.28, delay: 0.16 } })
              toast('Master reset', 'Volume and effects are back to the studio defaults.')
            }}
            title="Reset master"
          >
            RESET
          </button>
        </div>
      </div>
    </div>
  )
}
