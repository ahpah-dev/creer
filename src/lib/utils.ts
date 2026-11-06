import type { Clip, Note, Project, Track } from '../types'

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export const uid = (prefix = 'id') => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

export const IS_MAC =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.userAgent)
export const MOD_LABEL = IS_MAC ? '⌘' : 'Ctrl'
export const SHIFT_LABEL = IS_MAC ? '⇧' : 'Shift'
export const ALT_LABEL = IS_MAC ? '⌥' : 'Alt'

export const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] as const
export const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'] as const
export const KEY_ROOTS = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'] as const

export const midiToName = (midi: number, flats = false) => {
  const names = flats ? FLAT_NAMES : NOTE_NAMES
  return `${names[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`
}

export const midiToPitchClass = (midi: number) => ((midi % 12) + 12) % 12

export const isBlackKey = (midi: number) => [1, 3, 6, 8, 10].includes(midiToPitchClass(midi))

export const beatsToBars = (beats: number, timeSig = 4) => ({
  bar: Math.floor(beats / timeSig) + 1,
  beat: Math.floor(beats % timeSig) + 1,
  tick: Math.floor(((beats % 1) * 4) + 0.0001) + 1,
})

export const formatBeatPosition = (beats: number, timeSig = 4) => {
  const { bar, beat, tick } = beatsToBars(beats, timeSig)
  return `${String(bar).padStart(2, '0')}.${beat}.${tick}`
}

export const formatTime = (seconds: number) => {
  const safe = Math.max(0, seconds)
  const mins = Math.floor(safe / 60)
  const secs = Math.floor(safe % 60)
  const hundredths = Math.floor((safe % 1) * 100)
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`
}

export const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  return `${mins}:${String(secs).padStart(2, '0')}`
}

export const snapBeat = (beat: number, snap: number) => Math.round(beat / snap) * snap

export const floorBeat = (beat: number, snap: number) => Math.floor(beat / snap + 0.0001) * snap

export const projectEnd = (project: Project) => {
  let end = project.lengthBeats
  for (const track of project.tracks) {
    for (const clip of track.clips) end = Math.max(end, clip.start + clip.length)
  }
  return end
}

/** The end of the last actual region, ignoring the trailing empty timeline. */
export const contentEnd = (project: Project) => {
  let end = 0
  for (const track of project.tracks) {
    for (const clip of track.clips) end = Math.max(end, clip.start + clip.length)
  }
  return end
}

export const trackEnd = (track: Track) => {
  let end = 0
  for (const clip of track.clips) end = Math.max(end, clip.start + clip.length)
  return end
}

export const clipNoteRange = (clip: Clip, fallback = 60) => {
  if (!clip.notes.length) return { min: fallback - 7, max: fallback + 7 }
  let min = Infinity
  let max = -Infinity
  for (const note of clip.notes) {
    min = Math.min(min, note.pitch)
    max = Math.max(max, note.pitch)
  }
  return { min, max }
}

export const noteNameToMidi = (name: string, octave = 4) => {
  const normalized = name.replace('♯', '#').replace('♭', 'b')
  const map: Record<string, number> = {
    C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6,
    G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
  }
  return (map[normalized] ?? 0) + (octave + 1) * 12
}

export const keyPitchClass = (key: string) => {
  const normalized = key.replace('♯', '#').replace('♭', 'b')
  const map: Record<string, number> = {
    C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6,
    G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
  }
  return map[normalized] ?? 0
}

export const transposeNotesToKey = (notes: Omit<Note, 'id'>[], fromKey: string, toKey: string) => {
  let distance = keyPitchClass(toKey) - keyPitchClass(fromKey)
  if (distance > 6) distance -= 12
  if (distance < -6) distance += 12
  return notes.map((note) => ({ ...note, pitch: clamp(note.pitch + distance, 24, 96) }))
}

export const withNoteIds = (notes: Omit<Note, 'id'>[]) =>
  notes.map((note) => ({ ...note, id: uid('n') }))

export const deepClone = <T,>(value: T): T => {
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value)) as T
}

export const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

export const dbToGain = (db: number) => Math.pow(10, db / 20)
export const gainToDb = (gain: number) => (gain <= 0.0001 ? -60 : 20 * Math.log10(gain))

export const noteToPreview = (note: Note, _clip?: Clip) => ({
  pitch: note.pitch,
  start: note.start,
  duration: note.duration,
  velocity: note.velocity,
})

export const percent = (value: number) => `${Math.round(value)}%`

export const isTypingTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable
}

export const NOTE_LENGTH_OPTIONS = [
  { label: '1/16', value: 0.25 },
  { label: '1/8', value: 0.5 },
  { label: '1/4', value: 1 },
  { label: '1/2', value: 2 },
  { label: '1 bar', value: 4 },
]

export const SNAP_OPTIONS = [
  { label: '1/16', value: 0.25 },
  { label: '1/8T', value: 1 / 3 },
  { label: '1/8', value: 0.5 },
  { label: '1/4', value: 1 },
  { label: 'Bar', value: 4 },
]

export const TRACK_COLORS = [
  { name: 'Coral', value: '#e3876b' },
  { name: 'Apricot', value: '#e0a465' },
  { name: 'Sage', value: '#8ead91' },
  { name: 'Lilac', value: '#9693d6' },
  { name: 'Rose', value: '#d496a7' },
  { name: 'Sea', value: '#71aeb0' },
  { name: 'Sky', value: '#82a7c7' },
  { name: 'Sand', value: '#c2b083' },
] as const

export const getScaleNotes = (root: number, scale: 'minor' | 'major') => {
  const intervals = scale === 'minor' ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11]
  return intervals.map((interval) => (root + interval) % 12)
}
