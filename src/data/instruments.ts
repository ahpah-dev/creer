import type { InstrumentId, InstrumentInfo } from '../types'

export const INSTRUMENTS: InstrumentInfo[] = [
  {
    id: 'piano',
    name: 'Velvet Piano',
    shortName: 'Piano',
    category: 'Keys',
    description: 'A soft felt piano with a woody, intimate close-mic sound.',
    color: '#e7cfaa',
  },
  {
    id: 'electric',
    name: 'Moonlight Keys',
    shortName: 'E. Keys',
    category: 'Keys',
    description: 'Warm Rhodes-style keys with a gentle bell and slow tremolo.',
    color: '#dfb486',
  },
  {
    id: 'pad',
    name: 'Soft Focus',
    shortName: 'Pad',
    category: 'Pads',
    description: 'Slow-moving analog pads for wide, weightless harmony.',
    color: '#9a97de',
  },
  {
    id: 'bass',
    name: 'Round Bass',
    shortName: 'Bass',
    category: 'Bass',
    description: 'A plump analog bass with a deep sub and a mellow bite.',
    color: '#d8ab67',
  },
  {
    id: 'pluck',
    name: 'Paper Pluck',
    shortName: 'Pluck',
    category: 'Leads',
    description: 'A crisp, intimate pluck that cuts through without shouting.',
    color: '#e1a2b2',
  },
  {
    id: 'bell',
    name: 'Glass Bell',
    shortName: 'Bell',
    category: 'Keys',
    description: 'Shimmering FM bells that ring out like light through glass.',
    color: '#9bc6c2',
  },
  {
    id: 'strings',
    name: 'Slow Strings',
    shortName: 'Strings',
    category: 'Pads',
    description: 'A small, dusty string section recorded a little too close.',
    color: '#a9bd9c',
  },
  {
    id: 'organ',
    name: 'Sunday Organ',
    shortName: 'Organ',
    category: 'Keys',
    description: 'A warm drawbar organ with a calm, breathing tremolo.',
    color: '#d7bd8d',
  },
  {
    id: 'marimba',
    name: 'Wood & Mallet',
    shortName: 'Marimba',
    category: 'Keys',
    description: 'Rounded wooden mallets, perfect for small melodic phrases.',
    color: '#caa47c',
  },
  {
    id: 'drums',
    name: 'Studio Kit',
    shortName: 'Drums',
    category: 'Drums',
    description: 'A warm, slightly roomy kit built from scratch in the browser.',
    color: '#df8a75',
    isDrums: true,
  },
]

export const INSTRUMENT_MAP = Object.fromEntries(
  INSTRUMENTS.map((instrument) => [instrument.id, instrument]),
) as Record<InstrumentId, InstrumentInfo>

export const INSTRUMENT_GROUPS = ['Keys', 'Bass', 'Pads', 'Leads', 'Drums'] as const

export const DRUM_NOTES: { pitch: number; name: string; short: string }[] = [
  { pitch: 36, name: 'Kick', short: 'KICK' },
  { pitch: 37, name: 'Rim', short: 'RIM' },
  { pitch: 38, name: 'Snare', short: 'SNR' },
  { pitch: 39, name: 'Clap', short: 'CLAP' },
  { pitch: 41, name: 'Low Tom', short: 'LO' },
  { pitch: 42, name: 'Closed Hat', short: 'CH' },
  { pitch: 43, name: 'High Tom', short: 'HI' },
  { pitch: 45, name: 'Mid Tom', short: 'MID' },
  { pitch: 46, name: 'Open Hat', short: 'OH' },
  { pitch: 49, name: 'Crash', short: 'CRSH' },
  { pitch: 51, name: 'Ride', short: 'RIDE' },
  { pitch: 56, name: 'Cowbell', short: 'BELL' },
]

export const DRUM_NOTE_MAP = Object.fromEntries(DRUM_NOTES.map((note) => [note.pitch, note]))

export const getInstrumentName = (id: InstrumentId) => INSTRUMENT_MAP[id]?.name ?? id
