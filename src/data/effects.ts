import type {
  EffectCategory,
  EffectInstance,
  EffectType,
} from '../types'
import { uid } from '../lib/utils'

export interface EffectParamSpec {
  key: string
  label: string
  min: number
  max: number
  step: number
  default: number
  scale?: 'linear' | 'log'
  format: (value: number) => string
}

export interface EffectDefinition {
  id: EffectType
  name: string
  shortName: string
  category: EffectCategory
  description: string
  color: string
  params: EffectParamSpec[]
}

const percent = (value: number) => `${Math.round(value * 100)}%`
const hz = (value: number) =>
  value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)} kHz` : `${Math.round(value)} Hz`
const ms = (seconds: number) => `${Math.round(seconds * 1000)} ms`
const db = (value: number) =>
  `${value > 0 ? '+' : ''}${value.toFixed(1)} dB`
const ratio = (value: number) => `${value.toFixed(1)}:1`
const times = (value: number) => `${value.toFixed(1)}×`

export const EFFECT_DEFINITIONS: EffectDefinition[] = [
  {
    id: 'filter',
    name: 'Low-Pass Filter',
    shortName: 'FILTER',
    category: 'Tone',
    description: 'A gentle filter to take the edge off, or close the lid completely.',
    color: '#c7b183',
    params: [
      {
        key: 'cutoff',
        label: 'CUTOFF',
        min: 100,
        max: 16000,
        step: 1,
        default: 4200,
        scale: 'log',
        format: hz,
      },
      {
        key: 'resonance',
        label: 'RESONANCE',
        min: 0.1,
        max: 16,
        step: 0.1,
        default: 1.2,
        format: (value) => value.toFixed(1),
      },
    ],
  },
  {
    id: 'drive',
    name: 'Tape Drive',
    shortName: 'DRIVE',
    category: 'Tone',
    description: 'Warm saturation and a softer top end, like pushing tape.',
    color: '#d99b68',
    params: [
      {
        key: 'drive',
        label: 'DRIVE',
        min: 1,
        max: 16,
        step: 0.1,
        default: 5,
        format: times,
      },
      {
        key: 'tone',
        label: 'TONE',
        min: 500,
        max: 16000,
        step: 1,
        default: 5200,
        scale: 'log',
        format: hz,
      },
      {
        key: 'mix',
        label: 'MIX',
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.65,
        format: percent,
      },
    ],
  },
  {
    id: 'eq',
    name: 'Three-Band EQ',
    shortName: 'EQ',
    category: 'Tone',
    description: 'Shape the weight, presence and air of an instrument.',
    color: '#b9c49b',
    params: [
      {
        key: 'low',
        label: 'LOW',
        min: -12,
        max: 12,
        step: 0.1,
        default: 0,
        format: db,
      },
      {
        key: 'mid',
        label: 'MID',
        min: -12,
        max: 12,
        step: 0.1,
        default: 0,
        format: db,
      },
      {
        key: 'high',
        label: 'HIGH',
        min: -12,
        max: 12,
        step: 0.1,
        default: 0,
        format: db,
      },
    ],
  },
  {
    id: 'chorus',
    name: 'Wide Chorus',
    shortName: 'CHORUS',
    category: 'Modulation',
    description: 'A slow, liquid doubling that gives a sound more space.',
    color: '#9aa6d8',
    params: [
      {
        key: 'rate',
        label: 'RATE',
        min: 0.05,
        max: 6,
        step: 0.01,
        default: 0.8,
        scale: 'log',
        format: (value) => `${value.toFixed(2)} Hz`,
      },
      {
        key: 'depth',
        label: 'DEPTH',
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.55,
        format: percent,
      },
      {
        key: 'mix',
        label: 'MIX',
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.45,
        format: percent,
      },
    ],
  },
  {
    id: 'phaser',
    name: 'Slow Phaser',
    shortName: 'PHASER',
    category: 'Modulation',
    description: 'A drifting notch filter for a soft, swirling movement.',
    color: '#a79bcf',
    params: [
      {
        key: 'rate',
        label: 'RATE',
        min: 0.05,
        max: 5,
        step: 0.01,
        default: 0.35,
        scale: 'log',
        format: (value) => `${value.toFixed(2)} Hz`,
      },
      {
        key: 'depth',
        label: 'DEPTH',
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.65,
        format: percent,
      },
      {
        key: 'mix',
        label: 'MIX',
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.55,
        format: percent,
      },
    ],
  },
  {
    id: 'tremolo',
    name: 'Tremolo',
    shortName: 'TREM',
    category: 'Modulation',
    description: 'A warm pulse in the level, from a flicker to a deep wave.',
    color: '#d4a77e',
    params: [
      {
        key: 'rate',
        label: 'RATE',
        min: 0.1,
        max: 12,
        step: 0.01,
        default: 4.2,
        scale: 'log',
        format: (value) => `${value.toFixed(2)} Hz`,
      },
      {
        key: 'depth',
        label: 'DEPTH',
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.55,
        format: percent,
      },
    ],
  },
  {
    id: 'autopan',
    name: 'Auto Pan',
    shortName: 'AUTO PAN',
    category: 'Modulation',
    description: 'Move a sound gently across the stereo field.',
    color: '#8fb4a9',
    params: [
      {
        key: 'rate',
        label: 'RATE',
        min: 0.05,
        max: 5,
        step: 0.01,
        default: 0.28,
        scale: 'log',
        format: (value) => `${value.toFixed(2)} Hz`,
      },
      {
        key: 'depth',
        label: 'DEPTH',
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.65,
        format: percent,
      },
    ],
  },
  {
    id: 'delay',
    name: 'Echo Delay',
    shortName: 'DELAY',
    category: 'Space',
    description: 'A soft repeat with a dark feedback path, for depth without clutter.',
    color: '#8eb8b2',
    params: [
      {
        key: 'time',
        label: 'TIME',
        min: 0.05,
        max: 1.2,
        step: 0.005,
        default: 0.28,
        format: ms,
      },
      {
        key: 'feedback',
        label: 'FEEDBACK',
        min: 0,
        max: 0.85,
        step: 0.01,
        default: 0.34,
        format: percent,
      },
      {
        key: 'tone',
        label: 'TONE',
        min: 500,
        max: 10000,
        step: 1,
        default: 3600,
        scale: 'log',
        format: hz,
      },
      {
        key: 'mix',
        label: 'MIX',
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.35,
        format: percent,
      },
    ],
  },
  {
    id: 'reverb',
    name: 'Room Reverb',
    shortName: 'REVERB',
    category: 'Space',
    description: 'A small, warm room that sits behind the dry signal.',
    color: '#9d9acf',
    params: [
      {
        key: 'mix',
        label: 'MIX',
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.32,
        format: percent,
      },
      {
        key: 'tone',
        label: 'TONE',
        min: 1000,
        max: 14000,
        step: 1,
        default: 4600,
        scale: 'log',
        format: hz,
      },
    ],
  },
  {
    id: 'compressor',
    name: 'Bus Compressor',
    shortName: 'COMP',
    category: 'Dynamics',
    description: 'Glue a part together and give it a little more weight.',
    color: '#c1a878',
    params: [
      {
        key: 'threshold',
        label: 'THRESH',
        min: -48,
        max: 0,
        step: 0.5,
        default: -18,
        format: (value) => `${value.toFixed(1)} dB`,
      },
      {
        key: 'ratio',
        label: 'RATIO',
        min: 1,
        max: 16,
        step: 0.1,
        default: 4,
        format: ratio,
      },
      {
        key: 'makeup',
        label: 'MAKEUP',
        min: 0.5,
        max: 2.5,
        step: 0.01,
        default: 1,
        format: (value) => `${((value - 1) * 100).toFixed(0)}%`,
      },
    ],
  },
  {
    id: 'bitcrush',
    name: 'Bitcrush',
    shortName: 'CRUSH',
    category: 'Lo-Fi',
    description: 'Drop the resolution for dusty, broken-speaker texture.',
    color: '#c59287',
    params: [
      {
        key: 'bits',
        label: 'BITS',
        min: 2,
        max: 16,
        step: 1,
        default: 8,
        format: (value) => `${Math.round(value)} bit`,
      },
      {
        key: 'mix',
        label: 'MIX',
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.7,
        format: percent,
      },
    ],
  },
]

export const EFFECT_MAP = Object.fromEntries(
  EFFECT_DEFINITIONS.map((effect) => [effect.id, effect]),
) as Record<EffectType, EffectDefinition>

export const EFFECT_GROUPS: EffectCategory[] = [
  'Tone',
  'Modulation',
  'Space',
  'Dynamics',
  'Lo-Fi',
]

export const isEffectType = (value: unknown): value is EffectType =>
  typeof value === 'string' && value in EFFECT_MAP

export const defaultEffectParams = (type: EffectType): Record<string, number> =>
  Object.fromEntries(
    EFFECT_MAP[type].params.map((param) => [param.key, param.default]),
  )

export const makeEffect = (type: EffectType): EffectInstance => ({
  id: uid('fx'),
  type,
  enabled: true,
  params: defaultEffectParams(type),
})

export const normalizeEffect = (value: unknown): EffectInstance | null => {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<EffectInstance>
  if (!isEffectType(raw.type)) return null
  const defaults = defaultEffectParams(raw.type)
  const params: Record<string, number> = { ...defaults }
  for (const spec of EFFECT_MAP[raw.type].params) {
    const candidate = raw.params?.[spec.key]
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      params[spec.key] = Math.max(spec.min, Math.min(spec.max, candidate))
    }
  }
  return {
    id: raw.id ?? uid('fx'),
    type: raw.type,
    enabled: raw.enabled !== false,
    params,
  }
}

export const normalizeEffects = (value: unknown): EffectInstance[] => {
  if (!Array.isArray(value)) return []
  return value
    .map(normalizeEffect)
    .filter((effect): effect is EffectInstance => effect !== null)
}
