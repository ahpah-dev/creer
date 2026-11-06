import { useEffect, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import {
  Activity,
  AudioLines,
  ChevronLeft,
  ChevronRight,
  Filter,
  Flame,
  Gauge,
  Grid2X2,
  MoveHorizontal,
  Orbit,
  Plus,
  Power,
  Repeat2,
  Sparkles,
  Trash2,
  Wand2,
  Waves,
  X,
} from 'lucide-react'
import type { EffectInstance, EffectType } from '../types'
import {
  EFFECT_DEFINITIONS,
  EFFECT_MAP,
  makeEffect,
  type EffectDefinition,
  type EffectParamSpec,
} from '../data/effects'
import { useProjectStore } from '../store/project'
import { useSessionStore } from '../store/session'
import { clamp } from '../lib/utils'

const EFFECT_ICONS: Record<EffectType, typeof Wand2> = {
  filter: Filter,
  drive: Flame,
  eq: AudioLines,
  chorus: Waves,
  phaser: Orbit,
  tremolo: Activity,
  autopan: MoveHorizontal,
  delay: Repeat2,
  reverb: Sparkles,
  compressor: Gauge,
  bitcrush: Grid2X2,
}

const MAX_EFFECTS = 8

const positionFor = (spec: EffectParamSpec, value: number) => {
  if (spec.scale === 'log') {
    return Math.log(Math.max(spec.min, value) / spec.min) / Math.log(spec.max / spec.min)
  }
  return (value - spec.min) / (spec.max - spec.min)
}

const valueFor = (spec: EffectParamSpec, position: number) => {
  const normalized = clamp(position, 0, 1)
  const raw =
    spec.scale === 'log'
      ? spec.min * Math.pow(spec.max / spec.min, normalized)
      : spec.min + normalized * (spec.max - spec.min)
  const stepped = Math.round(raw / spec.step) * spec.step
  return clamp(Number(stepped.toFixed(4)), spec.min, spec.max)
}

function EffectParam({
  spec,
  value,
  color,
  onChange,
}: {
  spec: EffectParamSpec
  value: number
  color: string
  onChange: (value: number) => void
}) {
  const position = positionFor(spec, value)
  return (
    <label className="fx-param" style={{ '--fx-color': color } as CSSProperties}>
      <span className="fx-param-head">
        <em>{spec.label}</em>
        <b>{spec.format(value)}</b>
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.001}
        value={position}
        onChange={(event) => onChange(valueFor(spec, Number(event.target.value)))}
        onDoubleClick={() => onChange(spec.default)}
        aria-label={spec.label}
        aria-valuetext={spec.format(value)}
        style={{ ['--fx-progress' as string]: `${position * 100}%` }}
      />
    </label>
  )
}

function EffectCard({
  effect,
  index,
  total,
  onToggle,
  onRemove,
  onMove,
  onParam,
}: {
  effect: EffectInstance
  index: number
  total: number
  onToggle: () => void
  onRemove: () => void
  onMove: (direction: -1 | 1) => void
  onParam: (key: string, value: number) => void
}) {
  const definition = EFFECT_MAP[effect.type]
  const Icon = EFFECT_ICONS[effect.type]
  return (
    <div
      className={`fx-card ${effect.enabled ? '' : 'is-bypassed'}`}
      style={{ '--fx-color': definition.color } as CSSProperties}
    >
      <div className="fx-card-head">
        <span className="fx-card-icon">
          <Icon size={15} />
        </span>
        <span className="fx-card-title">
          <strong>{definition.name}</strong>
          <em>{definition.category}</em>
        </span>
        <button
          className={`fx-power ${effect.enabled ? 'is-on' : ''}`}
          onClick={onToggle}
          role="switch"
          aria-checked={effect.enabled}
          aria-label={effect.enabled ? `Bypass ${definition.name}` : `Enable ${definition.name}`}
          title={effect.enabled ? 'Bypass effect' : 'Enable effect'}
        >
          <Power size={11} />
        </button>
      </div>
      <div className="fx-params">
        {definition.params.map((spec) => (
          <EffectParam
            key={spec.key}
            spec={spec}
            color={definition.color}
            value={effect.params[spec.key] ?? spec.default}
            onChange={(value) => onParam(spec.key, value)}
          />
        ))}
      </div>
      <div className="fx-card-footer">
        <button
          className="fx-step"
          onClick={() => onMove(-1)}
          disabled={index === 0}
          aria-label={`Move ${definition.name} earlier`}
          title="Move earlier in the chain"
        >
          <ChevronLeft size={12} />
        </button>
        <span>{String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}</span>
        <button
          className="fx-step"
          onClick={() => onMove(1)}
          disabled={index === total - 1}
          aria-label={`Move ${definition.name} later`}
          title="Move later in the chain"
        >
          <ChevronRight size={12} />
        </button>
        <button
          className="fx-remove"
          onClick={onRemove}
          aria-label={`Remove ${definition.name}`}
          title="Remove effect"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
}

function EffectBrowser({
  canAdd,
  onAdd,
  onClose,
}: {
  canAdd: boolean
  onAdd: (definition: EffectDefinition) => void
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div
      className="fx-browser-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="fx-browser"
        role="dialog"
        aria-modal="true"
        aria-label="Effect library"
      >
        <button className="fx-browser-close" onClick={onClose} aria-label="Close effect library">
          <X size={15} />
        </button>
        <div className="fx-browser-head">
          <span className="eyebrow">EFFECT LIBRARY</span>
          <h2>Add a color.</h2>
          <p>Inserts run top to bottom on the selected chain.</p>
        </div>
        <div className="fx-browser-grid">
          {EFFECT_DEFINITIONS.map((definition) => {
            const Icon = EFFECT_ICONS[definition.id]
            return (
              <button
                key={definition.id}
                className="fx-library-card"
                style={{ '--fx-color': definition.color } as CSSProperties}
                onClick={() => onAdd(definition)}
                disabled={!canAdd}
              >
                <span className="fx-library-icon">
                  <Icon size={17} />
                </span>
                <span className="fx-library-copy">
                  <em>{definition.category}</em>
                  <strong>{definition.name}</strong>
                  <span>{definition.description}</span>
                </span>
                <span className="fx-library-add">
                  <Plus size={11} />
                  {canAdd ? 'Add' : 'Full'}
                </span>
              </button>
            )
          })}
        </div>
        {!canAdd && (
          <p className="fx-browser-limit">
            This chain already has {MAX_EFFECTS} effects. Remove one to add another.
          </p>
        )}
      </div>
    </div>,
    document.body,
  )
}

export function EffectsPanel() {
  const project = useProjectStore((state) => state.project)
  const selectedTrackId = useProjectStore((state) => state.selectedTrackId)
  const updateTrack = useProjectStore((state) => state.updateTrack)
  const updateProject = useProjectStore((state) => state.updateProject)
  const target = useSessionStore((state) => state.effectsTarget)
  const setTarget = useSessionStore((state) => state.setEffectsTarget)
  const toast = useSessionStore((state) => state.toast)
  const [browserOpen, setBrowserOpen] = useState(false)

  const track =
    project.tracks.find((item) => item.id === selectedTrackId) ?? project.tracks[0] ?? null
  const isMaster = target === 'master'
  const effects = isMaster ? project.master.effects : (track?.effects ?? [])
  const targetName = isMaster ? 'Master output' : (track?.name ?? 'No track')
  const targetColor = isMaster ? '#f2a679' : (track?.color ?? '#c8b285')

  const applyEffects = (
    next: EffectInstance[],
    options?: { coalesce?: string },
  ) => {
    if (isMaster) {
      updateProject(
        { master: { ...project.master, effects: next } },
        options,
      )
    } else if (track) {
      updateTrack(track.id, { effects: next }, options)
    }
  }

  const addEffect = (definition: EffectDefinition) => {
    if (effects.length >= MAX_EFFECTS) {
      toast('Effect chain is full', `Up to ${MAX_EFFECTS} inserts per chain.`, 'warn')
      return
    }
    applyEffects([...effects, makeEffect(definition.id)])
    setBrowserOpen(false)
    toast(`${definition.name} added`, 'Shape it below, or move it in the chain.', 'success')
  }

  const updateParam = (id: string, key: string, value: number) => {
    applyEffects(
      effects.map((effect) =>
        effect.id === id
          ? { ...effect, params: { ...effect.params, [key]: value } }
          : effect,
      ),
      { coalesce: `fx-param:${isMaster ? 'master' : track?.id}:${id}:${key}` },
    )
  }

  const moveEffect = (id: string, direction: -1 | 1) => {
    const index = effects.findIndex((effect) => effect.id === id)
    const nextIndex = index + direction
    if (index < 0 || nextIndex < 0 || nextIndex >= effects.length) return
    const next = [...effects]
    const [effect] = next.splice(index, 1)
    next.splice(nextIndex, 0, effect)
    applyEffects(next)
  }

  return (
    <div className="fx-panel" style={{ '--fx-target-color': targetColor } as CSSProperties}>
      <div className="fx-toolbar">
        <div className="fx-target-switch" role="group" aria-label="Effect target">
          <button
            className={!isMaster ? 'is-active' : ''}
            onClick={() => {
              setTarget('track')
              setBrowserOpen(false)
            }}
            aria-pressed={!isMaster}
          >
            TRACK
          </button>
          <button
            className={isMaster ? 'is-active' : ''}
            onClick={() => {
              setTarget('master')
              setBrowserOpen(false)
            }}
            aria-pressed={isMaster}
          >
            MASTER
          </button>
        </div>
        <div className="fx-target-info">
          <i />
          <span>
            <em>INSERT CHAIN</em>
            <strong>{targetName}</strong>
          </span>
          <b>{effects.length} / {MAX_EFFECTS}</b>
        </div>
        <div className="fx-actions">
          {effects.length > 0 && (
            <button
              className="fx-clear"
              onClick={() => {
                applyEffects([])
                toast('Effect chain cleared', 'Undo brings the inserts back.')
              }}
            >
              Clear
            </button>
          )}
          <button className="fx-add-button" onClick={() => setBrowserOpen(true)}>
            <Plus size={13} /> Add effect
          </button>
        </div>
      </div>

      <div className="fx-body">
        {effects.length === 0 ? (
          <div className="fx-empty">
            <span className="fx-empty-icon">
              <Wand2 size={24} />
            </span>
            <span>No inserts on this chain</span>
            <p>Add a filter, drive, chorus or another color.</p>
            <button className="fx-add-button" onClick={() => setBrowserOpen(true)}>
              <Plus size={13} /> Add your first effect
            </button>
          </div>
        ) : (
          <div className="fx-chain-scroll">
            <div className="fx-chain">
              <span className="fx-chain-endpoint">IN</span>
              {effects.map((effect, index) => (
                <EffectCard
                  key={effect.id}
                  effect={effect}
                  index={index}
                  total={effects.length}
                  onToggle={() =>
                    applyEffects(
                      effects.map((item) =>
                        item.id === effect.id
                          ? { ...item, enabled: !item.enabled }
                          : item,
                      ),
                    )
                  }
                  onRemove={() => {
                    applyEffects(effects.filter((item) => item.id !== effect.id))
                    toast(`${EFFECT_MAP[effect.type].name} removed`)
                  }}
                  onMove={(direction) => moveEffect(effect.id, direction)}
                  onParam={(key, value) => updateParam(effect.id, key, value)}
                />
              ))}
              <button
                className="fx-add-card"
                onClick={() => setBrowserOpen(true)}
                aria-label="Add another effect"
              >
                <Plus size={16} />
                <span>Add effect</span>
              </button>
              <span className="fx-chain-endpoint">OUT</span>
            </div>
          </div>
        )}
      </div>

      {browserOpen && (
        <EffectBrowser
          canAdd={effects.length < MAX_EFFECTS}
          onAdd={addEffect}
          onClose={() => setBrowserOpen(false)}
        />
      )}
    </div>
  )
}
