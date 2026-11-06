import { Drum, Guitar, Music2, Piano, Sparkles, Waves } from 'lucide-react'
import type { InstrumentId } from '../types'
import { isDrumInstrument } from '../data/instruments'

const sparkleIds: InstrumentId[] = [
  'pluck',
  'bell',
  'musicbox',
  'neon',
  'kalimba',
  'celesta',
  'vibraphone',
  'halo',
]
const waveIds: InstrumentId[] = ['pad', 'strings', 'aurora', 'choir']
const guitarIds: InstrumentId[] = [
  'bass',
  'sub',
  'fretless',
  'eightoheight',
  'reese',
  'nylon',
  'cello',
]

export function TrackIcon({ instrument, size = 14 }: { instrument: InstrumentId; size?: number }) {
  const Icon =
    instrument === 'musicbox'
      ? Music2
      : isDrumInstrument(instrument)
        ? Drum
        : guitarIds.includes(instrument)
          ? Guitar
          : waveIds.includes(instrument)
            ? Waves
            : sparkleIds.includes(instrument)
              ? Sparkles
              : Piano
  return <Icon size={size} strokeWidth={1.8} aria-hidden="true" />
}
