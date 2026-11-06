import { AudioWaveform, Drum, Guitar, Piano, Sparkles, Waves } from 'lucide-react'
import type { InstrumentId } from '../types'

const iconFor: Record<InstrumentId, typeof Piano> = {
  drums: Drum,
  bass: Guitar,
  pad: Waves,
  strings: Waves,
  pluck: Sparkles,
  bell: Sparkles,
  piano: Piano,
  electric: Piano,
  organ: Piano,
  marimba: Piano,
}

export function TrackIcon({ instrument, size = 14 }: { instrument: InstrumentId; size?: number }) {
  const Icon = iconFor[instrument] ?? AudioWaveform
  return <Icon size={size} strokeWidth={1.8} aria-hidden="true" />
}
