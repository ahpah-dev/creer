import type { Clip, LoopDef, Note, Project, Track } from '../types'
import { uid } from '../lib/utils'

const note = (pitch: number, start: number, duration: number, velocity = 0.8): Note => ({
  id: uid('n'),
  pitch,
  start,
  duration,
  velocity,
})

type DrumHit = { pitch: number; at: number; vel: number; dur?: number }

const kick = (at: number, vel = 0.95): DrumHit => ({ pitch: 36, at, vel })
const snare = (at: number, vel = 0.8): DrumHit => ({ pitch: 38, at, vel })
const clap = (at: number, vel = 0.55): DrumHit => ({ pitch: 39, at, vel })
const hat = (at: number, vel = 0.5, open = false): DrumHit => ({
  pitch: open ? 46 : 42,
  at,
  vel,
  dur: open ? 0.55 : 0.14,
})
const rim = (at: number, vel = 0.4): DrumHit => ({ pitch: 37, at, vel })
const ride = (at: number, vel = 0.32): DrumHit => ({ pitch: 51, at, vel, dur: 0.8 })

const hitsToNotes = (hits: DrumHit[]): Note[] =>
  hits.map((hit) => note(hit.pitch, hit.at, hit.dur ?? 0.18, hit.vel))

const barHits = (bar: number, kind: 'intro' | 'verse' | 'lift' | 'outro'): DrumHit[] => {
  const at = bar * 4
  const hits: DrumHit[] = []

  if (kind === 'intro') {
    hits.push(kick(at, 0.85), kick(at + 2.5, 0.55))
    for (let i = 0; i < 8; i++) hits.push(hat(at + i * 0.5, i % 2 ? 0.22 : 0.34))
    if (bar >= 2) {
      hits.push(rim(at + 1, 0.35), rim(at + 3.25, 0.25))
      hits.push(snare(at + 3, 0.45))
    }
    if (bar === 3) hits.push(hat(at + 3.75, 0.28, true))
    return hits
  }

  if (kind === 'verse') {
    hits.push(kick(at, 0.95), kick(at + 2.5, 0.7))
    if (bar % 2 === 1) hits.push(kick(at + 3.25, 0.5))
    hits.push(snare(at + 1, 0.83), snare(at + 3, 0.88))
    hits.push(clap(at + 3, 0.28))
    for (let i = 0; i < 8; i++) hits.push(hat(at + i * 0.5, i % 2 === 1 ? 0.44 : 0.25))
    if (bar === 3) hits.push(hat(at + 3.5, 0.32, true))
    if (bar === 1) hits.push(rim(at + 2.25, 0.28))
    return hits
  }

  if (kind === 'lift') {
    hits.push(kick(at, 1), kick(at + 2.5, 0.8))
    if (bar % 2 === 1) hits.push(kick(at + 3.25, 0.6))
    hits.push(snare(at + 1, 0.9), snare(at + 3, 0.92))
    hits.push(clap(at + 3, 0.4))
    for (let i = 0; i < 8; i++) hits.push(hat(at + i * 0.5, i % 2 === 1 ? 0.48 : 0.3))
    if (bar === 0 || bar === 2) hits.push(ride(at, 0.4))
    if (bar === 3) {
      hits.push(hat(at + 3.5, 0.35, true))
      hits.push(snare(at + 3.75, 0.55))
    }
    return hits
  }

  hits.push(kick(at, 0.75), kick(at + 2, 0.5))
  hits.push(snare(at + 3, 0.5))
  for (let i = 0; i < 8; i++) hits.push(hat(at + i * 0.5, i % 2 ? 0.2 : 0.3))
  if (bar === 0) hits.push(hat(at, 0.42, true))
  return hits
}

const drumsClip = (name: string, start: number, bars: number, kind: 'intro' | 'verse' | 'lift' | 'outro'): Clip => {
  const hits: DrumHit[] = []
  for (let bar = 0; bar < bars; bar++) hits.push(...barHits(bar, kind))
  return {
    id: uid('c'),
    name,
    start,
    length: bars * 4,
    notes: hitsToNotes(hits),
  }
}

const CHORDS = [
  [57, 60, 64, 67],
  [53, 57, 60, 64],
  [55, 60, 64, 71],
  [55, 59, 62, 64],
]

const bassRoots = [45, 41, 48, 43]

const bassClip = (name: string, start: number, bars: number, sparse = false): Clip => {
  const notes: Note[] = []
  for (let bar = 0; bar < bars; bar++) {
    const root = bassRoots[bar % 4]
    if (sparse) {
      notes.push(note(root, bar * 4, 1.8, 0.72))
      notes.push(note(root + 12, bar * 4 + 2.5, 1.1, 0.52))
    } else {
      notes.push(note(root, bar * 4, 0.95, 0.9))
      notes.push(note(root, bar * 4 + 1.5, 0.4, 0.58))
      notes.push(note(root + 7, bar * 4 + 2, 0.7, 0.76))
      notes.push(note(root + 12, bar * 4 + 3.5, 0.4, 0.55))
      if (bar % 2 === 1) notes.push(note(root + 7, bar * 4 + 3.0, 0.25, 0.35))
    }
  }
  return { id: uid('c'), name, start, length: bars * 4, notes }
}

const keysClip = (name: string, start: number, bars: number, sparse = false): Clip => {
  const notes: Note[] = []
  for (let bar = 0; bar < bars; bar++) {
    const chord = CHORDS[bar % 4]
    if (sparse) {
      for (const pitch of chord) notes.push(note(pitch, bar * 4, 3.7, 0.48))
      continue
    }
    for (const pitch of chord) {
      notes.push(note(pitch, bar * 4 + 0.5, 1.0, 0.6))
      notes.push(note(pitch, bar * 4 + 2.5, 1.2, 0.5))
    }
    notes.push(note(chord[2] + 12, bar * 4 + 1.75, 0.55, 0.3))
  }
  return { id: uid('c'), name, start, length: bars * 4, notes }
}

const padClip = (name: string, start: number, bars: number): Clip => {
  const notes: Note[] = []
  for (let bar = 0; bar < bars; bar++) {
    const chord = CHORDS[bar % 4]
    for (const pitch of chord) notes.push(note(pitch - 12, bar * 4, 3.9, 0.35))
    notes.push(note(chord[3], bar * 4, 3.9, 0.22))
  }
  return { id: uid('c'), name, start, length: bars * 4, notes }
}

const leadClip = (name: string, start: number, bars: number, variant: 'lift' | 'outro'): Clip => {
  const notes: Note[] = []
  const melodies = variant === 'lift'
    ? [
        [76, 0, 0.75], [72, 0.75, 0.5], [74, 1.5, 0.75], [76, 2.5, 1.25], [79, 3.75, 0.5],
        [77, 0, 0.75], [76, 0.75, 0.5], [72, 1.5, 1.0], [74, 2.75, 0.75], [76, 3.5, 0.5],
        [79, 0, 0.75], [77, 0.75, 0.5], [74, 1.5, 0.75], [76, 2.5, 1.5], [72, 4 - 0.25, 0.25],
        [74, 0, 0.75], [76, 0.75, 0.5], [79, 1.5, 1.0], [77, 2.75, 0.75], [74, 3.5, 0.5],
      ]
    : [
        [72, 0, 1.5], [76, 1.5, 0.75], [74, 2.5, 1.5],
        [72, 0, 1.0], [69, 1.25, 1.0], [72, 2.5, 0.75], [74, 3.5, 0.5],
        [76, 0, 1.5], [74, 1.75, 0.75], [72, 2.5, 1.25],
        [69, 0, 2.0], [72, 2.5, 1.5],
      ]
  const notesInBar = variant === 'lift' ? 5 : 4
  for (let bar = 0; bar < bars; bar++) {
    const barMelody = melodies.slice((bar % 4) * notesInBar, (bar % 4 + 1) * notesInBar)
    for (const [pitch, at, duration] of barMelody) {
      notes.push(note(pitch, bar * 4 + at, duration, 0.58 + Math.random() * 0.1))
    }
  }
  return { id: uid('c'), name, start, length: bars * 4, notes }
}

const bellsClip = (name: string, start: number, bars: number): Clip => {
  const notes: Note[] = []
  const sparkle = [
    [81, 0.5, 0.5], [84, 1.5, 0.5], [79, 2.5, 0.5], [76, 3.5, 0.5],
    [77, 0.5, 0.5], [81, 1.5, 0.5], [84, 2.5, 0.5], [79, 3.5, 0.5],
    [79, 0.5, 0.5], [84, 1.5, 0.5], [83, 2.5, 0.5], [79, 3.5, 0.5],
    [76, 0.5, 0.5], [79, 1.5, 0.5], [81, 2.5, 0.5], [84, 3.5, 0.5],
  ]
  for (let bar = 0; bar < bars; bar++) {
    const barNotes = sparkle.slice((bar % 4) * 4, (bar % 4 + 1) * 4)
    for (const [pitch, at, duration] of barNotes) {
      notes.push(note(pitch, bar * 4 + at, duration, 0.22 + Math.random() * 0.09))
    }
  }
  return { id: uid('c'), name, start, length: bars * 4, notes }
}

const makeTrack = (
  name: string,
  instrument: Track['instrument'],
  color: string,
  volume: number,
  pan: number,
  clips: Clip[],
  reverbSend: number,
  delaySend: number,
): Track => ({
  id: uid('t'),
  name,
  instrument,
  color,
  volume,
  pan,
  mute: false,
  solo: false,
  armed: false,
  reverbSend,
  delaySend,
  clips,
})

export const createDemoProject = (): Project => {
  const tracks: Track[] = [
    makeTrack(
      'Studio Kit',
      'drums',
      '#dd876f',
      0.84,
      0,
      [
        drumsClip('First Light', 0, 2, 'intro'),
        drumsClip('Pocket', 8, 2, 'verse'),
        drumsClip('Open Road', 16, 4, 'verse'),
        drumsClip('Lift', 32, 4, 'lift'),
        drumsClip('Last Call', 48, 4, 'outro'),
      ],
      0.08,
      0.03,
    ),
    makeTrack(
      'Round Bass',
      'bass',
      '#d2a45f',
      0.8,
      0,
      [
        bassClip('Low Tide', 8, 2, true),
        bassClip('Undertow', 16, 4),
        bassClip('Open Road', 32, 4),
        bassClip('Home', 48, 4),
      ],
      0.04,
      0.02,
    ),
    makeTrack(
      'Moonlight Keys',
      'electric',
      '#8cac91',
      0.63,
      -0.12,
      [
        keysClip('First Light', 8, 2, true),
        keysClip('Golden Hour', 16, 4),
        keysClip('Open Road', 32, 4),
        keysClip('Home', 48, 4),
      ],
      0.18,
      0.12,
    ),
    makeTrack(
      'Soft Focus',
      'pad',
      '#9693d6',
      0.5,
      0.16,
      [padClip('Dawn', 0, 4), padClip('Wash', 16, 8), padClip('Fade', 48, 4)],
      0.42,
      0.06,
    ),
    makeTrack(
      'Paper Planes',
      'pluck',
      '#d99aac',
      0.66,
      -0.2,
      [leadClip('Open Road', 32, 4, 'lift'), leadClip('Home', 48, 4, 'outro')],
      0.24,
      0.2,
    ),
    makeTrack(
      'Glass Drops',
      'bell',
      '#78b3b0',
      0.42,
      0.28,
      [bellsClip('Somewhere', 16, 4), bellsClip('Golden Hour', 32, 4)],
      0.36,
      0.08,
    ),
  ]

  return {
    version: 1,
    id: uid('project'),
    name: 'Golden Hour',
    bpm: 96,
    timeSig: 4,
    key: 'A',
    scale: 'minor',
    lengthBeats: 64,
    tracks,
    sections: [
      { id: uid('s'), name: 'Prelude', start: 0, length: 16 },
      { id: uid('s'), name: 'Verse', start: 16, length: 16 },
      { id: uid('s'), name: 'Lift', start: 32, length: 16 },
      { id: uid('s'), name: 'Outro', start: 48, length: 16 },
    ],
    loop: { enabled: false, start: 16, end: 48 },
    swing: { enabled: false, amount: 50, division: 8 },
    master: { volume: 0.8, reverb: 0.28, delay: 0.16 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export const createEmptyProject = (name = 'Untitled Song'): Project => {
  const project = createDemoProject()
  project.name = name
  project.tracks = [
    makeTrack('Studio Kit', 'drums', '#dd876f', 0.84, 0, [], 0.08, 0.03),
    makeTrack('Round Bass', 'bass', '#d2a45f', 0.8, 0, [], 0.04, 0.02),
    makeTrack('Moonlight Keys', 'electric', '#8cac91', 0.63, 0, [], 0.18, 0.12),
    makeTrack('Soft Focus', 'pad', '#9693d6', 0.5, 0, [], 0.42, 0.06),
  ]
  project.sections = [
    { id: uid('s'), name: 'Section A', start: 0, length: 16 },
    { id: uid('s'), name: 'Section B', start: 16, length: 16 },
    { id: uid('s'), name: 'Section C', start: 32, length: 16 },
    { id: uid('s'), name: 'Section D', start: 48, length: 16 },
  ]
  project.loop = { enabled: false, start: 0, end: 16 }
  project.lengthBeats = 64
  project.tracks[2].armed = true
  project.createdAt = new Date().toISOString()
  project.updatedAt = project.createdAt
  return project
}

const loopNote = (pitch: number, start: number, duration: number, velocity: number): Omit<Note, 'id'> => ({
  pitch,
  start,
  duration,
  velocity,
})

const grooveNotes = (kind: 'soft' | 'night' | 'neon', bars = 2): Omit<Note, 'id'>[] => {
  const notes: Omit<Note, 'id'>[] = []
  for (let bar = 0; bar < bars; bar++) {
    const at = bar * 4
    if (kind === 'soft') {
      notes.push(loopNote(36, at, 0.2, 0.85), loopNote(36, at + 2.5, 0.2, 0.6))
      notes.push(loopNote(38, at + 3, 0.2, 0.55))
      for (let i = 0; i < 8; i++) notes.push(loopNote(42, at + i * 0.5, 0.12, i % 2 ? 0.22 : 0.3))
    } else if (kind === 'night') {
      notes.push(loopNote(36, at, 0.2, 0.95), loopNote(36, at + 1.75, 0.2, 0.45), loopNote(36, at + 2.5, 0.2, 0.7))
      notes.push(loopNote(38, at + 1, 0.2, 0.8), loopNote(38, at + 3, 0.2, 0.85))
      notes.push(loopNote(39, at + 3, 0.15, 0.25))
      for (let i = 0; i < 8; i++) notes.push(loopNote(42, at + i * 0.5, 0.1, i % 2 ? 0.34 : 0.2))
      if (bar === 1) notes.push(loopNote(46, at + 3.5, 0.6, 0.28))
    } else {
      notes.push(loopNote(36, at, 0.2, 1), loopNote(36, at + 2.75, 0.2, 0.7))
      notes.push(loopNote(38, at + 1, 0.18, 0.9), loopNote(38, at + 3, 0.18, 0.9))
      notes.push(loopNote(39, at + 3, 0.14, 0.38))
      for (let i = 0; i < 16; i++) notes.push(loopNote(42, at + i * 0.25, 0.08, i % 4 === 2 ? 0.34 : i % 2 ? 0.16 : 0.22))
      notes.push(loopNote(49, at, 1.6, 0.26))
    }
  }
  return notes
}

export const LOOPS: LoopDef[] = [
  {
    id: 'loop-pocket',
    name: 'Velvet Pocket',
    description: 'Loose brushy drums with a slow, quiet confidence.',
    category: 'Beats',
    instrument: 'drums',
    lengthBeats: 8,
    color: '#dd876f',
    notes: grooveNotes('soft', 2),
    tags: ['96 BPM', 'A min', 'chill'],
  },
  {
    id: 'loop-night',
    name: 'Night Drive',
    description: 'A patient half-time pocket built for long roads.',
    category: 'Beats',
    instrument: 'drums',
    lengthBeats: 8,
    color: '#d39179',
    notes: grooveNotes('night', 2),
    tags: ['96 BPM', 'A min', 'night'],
  },
  {
    id: 'loop-neon',
    name: 'Neon Half-Light',
    description: 'Crisp hats and a wide-open backbeat that lifts a room.',
    category: 'Beats',
    instrument: 'drums',
    lengthBeats: 8,
    color: '#df8f73',
    notes: grooveNotes('neon', 2),
    tags: ['96 BPM', 'A min', 'uplift'],
  },
  {
    id: 'loop-lowtide',
    name: 'Low Tide',
    description: 'A round bassline that leaves plenty of air between notes.',
    category: 'Bass',
    instrument: 'bass',
    lengthBeats: 8,
    color: '#d2a45f',
    notes: [
      loopNote(45, 0, 1.8, 0.8), loopNote(45, 2.5, 1.2, 0.55),
      loopNote(41, 4, 1.8, 0.8), loopNote(41, 6.5, 1.2, 0.55),
      loopNote(48, 8, 1.8, 0.8), loopNote(48, 10.5, 1.2, 0.55),
      loopNote(43, 12, 1.8, 0.8), loopNote(43, 14.5, 1.2, 0.55),
    ],
    tags: ['96 BPM', 'A min', 'bass'],
  },
  {
    id: 'loop-undertow',
    name: 'Undertow',
    description: 'A gently driving eighth-note bass with a soft sub.',
    category: 'Bass',
    instrument: 'bass',
    lengthBeats: 8,
    color: '#cba05f',
    notes: [
      ...Array.from({ length: 4 }, (_, i) => loopNote(45, i, 0.6, 0.8)),
      loopNote(52, 4, 0.6, 0.65), loopNote(45, 5, 0.6, 0.6), loopNote(48, 6, 0.6, 0.7), loopNote(50, 7, 0.6, 0.55),
      ...Array.from({ length: 4 }, (_, i) => loopNote(41, 8 + i, 0.6, 0.8)),
      loopNote(48, 12, 0.6, 0.65), loopNote(41, 13, 0.6, 0.6), loopNote(44, 14, 0.6, 0.7), loopNote(46, 15, 0.6, 0.55),
    ],
    tags: ['96 BPM', 'A min', 'bass'],
  },
  {
    id: 'loop-golden',
    name: 'Golden Chords',
    description: 'Warm seventh chords, played late and left to ring.',
    category: 'Chords',
    instrument: 'electric',
    lengthBeats: 16,
    color: '#8cac91',
    notes: [
      ...[57, 60, 64, 67].map((p) => loopNote(p, 0.5, 3.2, 0.5)),
      ...[53, 57, 60, 64].map((p) => loopNote(p, 4.5, 3.2, 0.5)),
      ...[55, 59, 62, 64].map((p) => loopNote(p, 8.5, 3.2, 0.5)),
      ...[57, 60, 64, 67].map((p) => loopNote(p, 12.5, 3.2, 0.5)),
    ],
    tags: ['A min', 'keys', 'warm'],
  },
  {
    id: 'loop-sunday',
    name: 'Sunday Air',
    description: 'A slow, wide pad with just enough movement.',
    category: 'Texture',
    instrument: 'pad',
    lengthBeats: 16,
    color: '#9693d6',
    notes: [
      ...[45, 48, 52, 55].map((p) => loopNote(p, 0, 3.9, 0.35)),
      ...[41, 45, 48, 52].map((p) => loopNote(p, 4, 3.9, 0.35)),
      ...[43, 47, 50, 52].map((p) => loopNote(p, 8, 3.9, 0.35)),
      ...[45, 48, 52, 55].map((p) => loopNote(p, 12, 3.9, 0.35)),
    ],
    tags: ['A min', 'pad', 'ambient'],
  },
  {
    id: 'loop-paper',
    name: 'Paper Planes',
    description: 'A small, whistful melody for the top of a mix.',
    category: 'Melody',
    instrument: 'pluck',
    lengthBeats: 8,
    color: '#d99aac',
    notes: [
      loopNote(76, 0, 0.7, 0.6), loopNote(72, 0.75, 0.45, 0.5), loopNote(74, 1.5, 0.7, 0.55),
      loopNote(76, 2.5, 1.1, 0.62), loopNote(79, 3.75, 0.4, 0.48),
      loopNote(77, 4, 0.7, 0.55), loopNote(76, 4.75, 0.45, 0.45), loopNote(72, 5.5, 0.9, 0.52),
      loopNote(74, 6.75, 0.7, 0.5), loopNote(76, 7.5, 0.35, 0.48),
    ],
    tags: ['A min', 'lead', 'soft'],
  },
  {
    id: 'loop-drops',
    name: 'Glass Drops',
    description: 'Sparse bell notes that catch the light.',
    category: 'Melody',
    instrument: 'bell',
    lengthBeats: 8,
    color: '#78b3b0',
    notes: [
      loopNote(81, 0.5, 0.5, 0.3), loopNote(84, 1.5, 0.5, 0.26), loopNote(79, 2.5, 0.5, 0.28), loopNote(76, 3.5, 0.5, 0.24),
      loopNote(77, 4.5, 0.5, 0.28), loopNote(81, 5.5, 0.5, 0.24), loopNote(84, 6.5, 0.5, 0.26), loopNote(79, 7.5, 0.5, 0.22),
    ],
    tags: ['A min', 'bells', 'sparkle'],
  },
  {
    id: 'loop-strings',
    name: 'Dust & Strings',
    description: 'A soft string bed that swells and settles.',
    category: 'Texture',
    instrument: 'strings',
    lengthBeats: 16,
    color: '#a9bd9c',
    notes: [
      ...[57, 60, 64].map((p) => loopNote(p, 0, 7.8, 0.3)),
      ...[53, 57, 60].map((p) => loopNote(p, 8, 7.8, 0.3)),
    ],
    tags: ['A min', 'strings', 'cinematic'],
  },
]
