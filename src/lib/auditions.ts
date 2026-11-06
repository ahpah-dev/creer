import type { InstrumentId, Note } from '../types'
import { INSTRUMENT_MAP, isDrumInstrument } from '../data/instruments'

type AuditionNote = Omit<Note, 'id'>

const chord = (pitches: number[], duration = 3.7, velocity = 0.5): AuditionNote[] =>
  pitches.map((pitch) => ({ pitch, start: 0, duration, velocity }))

/**
 * A short, musically useful phrase for the sound browser. The register and
 * shape follow the instrument family so every preview lands in a natural range.
 */
export const getAuditionNotes = (instrument: InstrumentId): AuditionNote[] => {
  if (isDrumInstrument(instrument)) {
    if (instrument === 'hand') {
      return [
        { pitch: 36, start: 0, duration: 0.2, velocity: 0.9 },
        { pitch: 42, start: 0.5, duration: 0.12, velocity: 0.45 },
        { pitch: 38, start: 1, duration: 0.2, velocity: 0.72 },
        { pitch: 42, start: 1.5, duration: 0.12, velocity: 0.38 },
        { pitch: 39, start: 2, duration: 0.2, velocity: 0.8 },
        { pitch: 36, start: 2.5, duration: 0.2, velocity: 0.65 },
        { pitch: 42, start: 3, duration: 0.12, velocity: 0.5 },
        { pitch: 38, start: 3.5, duration: 0.2, velocity: 0.6 },
      ]
    }
    return [
      { pitch: 36, start: 0, duration: 0.2, velocity: 0.92 },
      { pitch: 42, start: 0.5, duration: 0.1, velocity: 0.46 },
      { pitch: 38, start: 1, duration: 0.2, velocity: 0.8 },
      { pitch: 42, start: 1.5, duration: 0.1, velocity: 0.4 },
      { pitch: 36, start: 2, duration: 0.2, velocity: 0.86 },
      { pitch: 42, start: 2.5, duration: 0.1, velocity: 0.48 },
      { pitch: 38, start: 3, duration: 0.2, velocity: 0.82 },
      { pitch: 46, start: 3.5, duration: 0.3, velocity: 0.45 },
    ]
  }

  const info = INSTRUMENT_MAP[instrument]
  if (!info) return chord([60, 64, 67])
  if (info.category === 'Bass') {
    return [
      { pitch: 45, start: 0, duration: 0.9, velocity: 0.9 },
      { pitch: 45, start: 1.5, duration: 0.4, velocity: 0.58 },
      { pitch: 52, start: 2, duration: 0.75, velocity: 0.78 },
      { pitch: 48, start: 3, duration: 0.6, velocity: 0.62 },
    ]
  }
  if (info.category === 'Pads') {
    const pitches =
      instrument === 'aurora'
        ? [64, 67, 71, 76]
        : instrument === 'choir'
          ? [55, 59, 62, 67]
          : [57, 60, 64, 67]
    return chord(pitches, 3.8, 0.4)
  }
  if (info.category === 'Leads') {
    const base = 72
    return [
      { pitch: base, start: 0, duration: 0.65, velocity: 0.58 },
      { pitch: base + 4, start: 0.75, duration: 0.4, velocity: 0.5 },
      { pitch: base + 7, start: 1.5, duration: 0.7, velocity: 0.56 },
      { pitch: base + 11, start: 2.5, duration: 0.55, velocity: 0.48 },
      { pitch: base + 7, start: 3.25, duration: 0.6, velocity: 0.52 },
    ]
  }
  // Keys — a gentle seventh-chord arpeggio that shows the attack and tail.
  return [
    { pitch: 57, start: 0, duration: 1.8, velocity: 0.66 },
    { pitch: 60, start: 0, duration: 1.8, velocity: 0.6 },
    { pitch: 64, start: 0, duration: 1.8, velocity: 0.57 },
    { pitch: 67, start: 0, duration: 1.8, velocity: 0.52 },
    { pitch: 55, start: 2, duration: 1.8, velocity: 0.58 },
    { pitch: 59, start: 2, duration: 1.8, velocity: 0.54 },
    { pitch: 62, start: 2, duration: 1.8, velocity: 0.5 },
    { pitch: 67, start: 2, duration: 1.8, velocity: 0.46 },
  ]
}
