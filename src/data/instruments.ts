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
    id: 'harp',
    name: 'Gilded Harp',
    shortName: 'Harp',
    category: 'Keys',
    description: 'A close, golden harp with a soft pluck and long ringing overtones.',
    color: '#dcbd8e',
  },
  {
    id: 'wurlitzer',
    name: 'Red Room Wurli',
    shortName: 'Wurli',
    category: 'Keys',
    description: 'A smoky reed piano with a little more bark and bite.',
    color: '#e3a17e',
  },
  {
    id: 'toy',
    name: 'Toy Piano',
    shortName: 'Toy',
    category: 'Keys',
    description: 'Tiny metal tines and a playful, slightly out-of-tune charm.',
    color: '#e8d39a',
  },
  {
    id: 'musicbox',
    name: 'Music Box',
    shortName: 'Box',
    category: 'Keys',
    description: 'A tiny clockwork melody box, bright and full of wonder.',
    color: '#b9ced0',
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
    id: 'bass',
    name: 'Round Bass',
    shortName: 'Bass',
    category: 'Bass',
    description: 'A plump analog bass with a deep sub and a mellow bite.',
    color: '#d8ab67',
  },
  {
    id: 'sub',
    name: 'Deep End',
    shortName: 'Sub',
    category: 'Bass',
    description: 'A pure, patient sub bass for the low end of the room.',
    color: '#c6a264',
  },
  {
    id: 'fretless',
    name: 'Fretless',
    shortName: 'Fretless',
    category: 'Bass',
    description: 'A smooth, singing bass with a slow vibrato and soft edges.',
    color: '#bea571',
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
    id: 'strings',
    name: 'Slow Strings',
    shortName: 'Strings',
    category: 'Pads',
    description: 'A small, dusty string section recorded a little too close.',
    color: '#a9bd9c',
  },
  {
    id: 'aurora',
    name: 'Aurora',
    shortName: 'Aurora',
    category: 'Pads',
    description: 'A shimmering high pad that drifts like light on cold air.',
    color: '#8db9c9',
  },
  {
    id: 'choir',
    name: 'Dust Choir',
    shortName: 'Choir',
    category: 'Pads',
    description: 'A weathered choir hum with breath, air and a little tape hiss.',
    color: '#b0a6cb',
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
    id: 'neon',
    name: 'Neon Lead',
    shortName: 'Neon',
    category: 'Leads',
    description: 'A bright analog lead with a warm edge and a long shadow.',
    color: '#e58f83',
  },
  {
    id: 'kalimba',
    name: 'Kalimba',
    shortName: 'Kalimba',
    category: 'Leads',
    description: 'A thumb piano with a soft wooden body and a silver tine.',
    color: '#cfb27b',
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
  {
    id: 'lofi',
    name: 'Lo-Fi Kit',
    shortName: 'Lo-Fi',
    category: 'Drums',
    description: 'A dusty kit with soft edges, like drums heard through an old cassette.',
    color: '#c99a86',
    isDrums: true,
  },
  {
    id: 'hand',
    name: 'Hand Percussion',
    shortName: 'Hands',
    category: 'Drums',
    description: 'Congas, shakers and hand claps for a little human swing.',
    color: '#c9a878',
    isDrums: true,
  },
]

export const INSTRUMENT_MAP = Object.fromEntries(
  INSTRUMENTS.map((instrument) => [instrument.id, instrument]),
) as Record<InstrumentId, InstrumentInfo>

export const INSTRUMENT_GROUPS = ['Keys', 'Bass', 'Pads', 'Leads', 'Drums'] as const

export const DRUM_INSTRUMENT_IDS: InstrumentId[] = ['drums', 'lofi', 'hand']

export const isDrumInstrument = (instrument: InstrumentId) =>
  DRUM_INSTRUMENT_IDS.includes(instrument)

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
