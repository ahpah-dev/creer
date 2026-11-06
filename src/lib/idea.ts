import type { Clip, InstrumentId, Note, Project, Section, SwingSettings, Track } from '../types'
import { isDrumInstrument } from '../data/instruments'
import { clamp, keyPitchClass, projectEnd, uid } from './utils'

export type IdeaStyleId = 'lofi' | 'house' | 'ambient' | 'cinematic' | 'pop' | 'jazz'
export type IdeaPlacement = 'end' | 'playhead' | 'fresh'

export interface IdeaStyle {
  id: IdeaStyleId
  label: string
  description: string
  bpm: number
  color: string
  drums: InstrumentId | null
  bass: InstrumentId
  chords: InstrumentId
  texture: InstrumentId
  melody: InstrumentId
  progression: number[]
  seventh: boolean
  drumMode: 'lofi' | 'four' | 'pop' | 'jazz' | 'sparse'
  chordMode: 'long' | 'lofi' | 'house' | 'pop' | 'jazz'
  bassMode: 'lofi' | 'house' | 'pop' | 'walking' | 'long'
  melodyMode: 'lofi' | 'house' | 'ambient' | 'cinematic' | 'pop' | 'jazz'
  melodyOctave: number
  swing?: SwingSettings
}

export const IDEA_STYLES: IdeaStyle[] = [
  {
    id: 'lofi',
    label: 'Lo-Fi',
    description: 'Dusty keys, a soft kit and a lazy late-night pocket.',
    bpm: 78,
    color: '#c99a86',
    drums: 'lofi',
    bass: 'fretless',
    chords: 'electric',
    texture: 'pad',
    melody: 'kalimba',
    progression: [0, 5, 3, 4],
    seventh: true,
    drumMode: 'lofi',
    chordMode: 'lofi',
    bassMode: 'lofi',
    melodyMode: 'lofi',
    melodyOctave: 1,
    swing: { enabled: true, amount: 58, division: 16 },
  },
  {
    id: 'house',
    label: 'House',
    description: 'Four on the floor, offbeat air and a bright chord stab.',
    bpm: 122,
    color: '#d8a269',
    drums: 'drums',
    bass: 'bass',
    chords: 'organ',
    texture: 'pad',
    melody: 'pluck',
    progression: [0, 5, 3, 4],
    seventh: false,
    drumMode: 'four',
    chordMode: 'house',
    bassMode: 'house',
    melodyMode: 'house',
    melodyOctave: 1,
  },
  {
    id: 'ambient',
    label: 'Ambient',
    description: 'Slow air, long chords and a melody that drifts in.',
    bpm: 68,
    color: '#94b6c8',
    drums: null,
    bass: 'sub',
    chords: 'pad',
    texture: 'strings',
    melody: 'bell',
    progression: [0, 4, 5, 3],
    seventh: true,
    drumMode: 'sparse',
    chordMode: 'long',
    bassMode: 'long',
    melodyMode: 'ambient',
    melodyOctave: 1,
  },
  {
    id: 'cinematic',
    label: 'Cinematic',
    description: 'Wide strings, a low pulse and a slow-burning cello line.',
    bpm: 84,
    color: '#b08d6f',
    drums: 'vintage',
    bass: 'sub',
    chords: 'strings',
    texture: 'choir',
    melody: 'cello',
    progression: [0, 5, 2, 4],
    seventh: false,
    drumMode: 'sparse',
    chordMode: 'long',
    bassMode: 'long',
    melodyMode: 'cinematic',
    melodyOctave: 0,
  },
  {
    id: 'pop',
    label: 'Pop',
    description: 'A bright piano hook, a steady kit and a chorus-sized lift.',
    bpm: 108,
    color: '#dfb486',
    drums: 'drums',
    bass: 'bass',
    chords: 'piano',
    texture: 'strings',
    melody: 'pluck',
    progression: [0, 4, 5, 3],
    seventh: false,
    drumMode: 'pop',
    chordMode: 'pop',
    bassMode: 'pop',
    melodyMode: 'pop',
    melodyOctave: 1,
  },
  {
    id: 'jazz',
    label: 'Jazz',
    description: 'Brushed drums, seventh chords and a walking bass.',
    bpm: 112,
    color: '#b8aa8c',
    drums: 'brush',
    bass: 'fretless',
    chords: 'wurlitzer',
    texture: 'vibraphone',
    melody: 'vibraphone',
    progression: [1, 4, 0, 5],
    seventh: true,
    drumMode: 'jazz',
    chordMode: 'jazz',
    bassMode: 'walking',
    melodyMode: 'jazz',
    melodyOctave: 1,
    swing: { enabled: true, amount: 62, division: 8 },
  },
]

export interface IdeaOptions {
  styleId: IdeaStyleId
  bars: number
  placement: IdeaPlacement
  playhead: number
  seed?: number
}

export interface IdeaResult {
  project: Project
  startBeat: number
  lengthBeats: number
  summary: string
  focusTrackId: string | null
  focusClipId: string | null
}

const ROLE_COLORS = {
  drums: '#dd876f',
  bass: '#d8ab67',
  chords: '#dfb486',
  texture: '#9a97de',
  melody: '#e1a2b2',
} as const

const ROLE_META = {
  drums: { volume: 0.82, reverb: 0.08, delay: 0.03, pan: 0 },
  bass: { volume: 0.76, reverb: 0.04, delay: 0.02, pan: 0 },
  chords: { volume: 0.62, reverb: 0.26, delay: 0.08, pan: 0 },
  texture: { volume: 0.48, reverb: 0.42, delay: 0.06, pan: 0.12 },
  melody: { volume: 0.58, reverb: 0.24, delay: 0.16, pan: -0.1 },
} as const

type Role = keyof typeof ROLE_META

const ROLE_LABELS: Record<Role, string> = {
  drums: 'Drums',
  bass: 'Bass',
  chords: 'Chords',
  texture: 'Texture',
  melody: 'Melody',
}

const scaleFor = (project: Project) =>
  project.scale === 'minor' ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11]

const makeRandom = (seed: number) => {
  let value = seed >>> 0
  return () => {
    value += 0x6d2b79f5
    let t = value
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const uniqueName = (project: Project, base: string) => {
  const names = new Set(project.tracks.map((track) => track.name))
  if (!names.has(base)) return base
  let index = 2
  while (names.has(`${base} ${index}`)) index++
  return `${base} ${index}`
}

const makeTrack = (project: Project, style: IdeaStyle, role: Role, instrument: InstrumentId): Track => {
  const meta = ROLE_META[role]
  return {
    id: uid('t'),
    name: uniqueName(project, `${style.label} ${ROLE_LABELS[role]}`),
    instrument,
    color: ROLE_COLORS[role],
    volume: meta.volume,
    pan: meta.pan,
    mute: false,
    solo: false,
    armed: false,
    reverbSend: meta.reverb,
    delaySend: meta.delay,
    effects: [],
    clips: [],
  }
}

const fitPitch = (pitch: number, min: number, max: number) => {
  let next = pitch
  while (next < min) next += 12
  while (next > max) next -= 12
  return next
}

const roleHasInstrument = (role: Role, instrument: InstrumentId) => {
  if (role === 'drums') return isDrumInstrument(instrument)
  if (role === 'bass') return ['bass', 'sub', 'fretless', 'eightoheight', 'reese'].includes(instrument)
  if (role === 'chords') {
    return ['piano', 'electric', 'wurlitzer', 'organ', 'harpsichord', 'celesta', 'vibraphone', 'marimba'].includes(instrument)
  }
  if (role === 'texture') return ['pad', 'strings', 'aurora', 'choir', 'halo'].includes(instrument)
  return ['pluck', 'neon', 'kalimba', 'bell', 'flute', 'brass', 'supersaw', 'cello', 'nylon', 'harp', 'musicbox', 'toy'].includes(instrument)
}

interface VoiceBuilder {
  notes: Note[]
  add: (start: number, pitch: number, duration: number, velocity: number) => void
}

const makeVoiceBuilder = (clipLength: number): VoiceBuilder => {
  const notes: Note[] = []
  return {
    notes,
    add: (start, pitch, duration, velocity) => {
      if (start < 0 || start >= clipLength - 1e-6) return
      notes.push({
        id: uid('n'),
        pitch: clamp(Math.round(pitch), 24, 96),
        start: Math.max(0, Math.min(start, clipLength - 0.03)),
        duration: Math.max(0.03, Math.min(duration, clipLength - start)),
        velocity: clamp(velocity, 0.1, 1),
      })
    },
  }
}

export const generateIdea = (project: Project, options: IdeaOptions): IdeaResult => {
  const style = IDEA_STYLES.find((item) => item.id === options.styleId) ?? IDEA_STYLES[0]
  const bars = Math.max(2, Math.min(32, options.bars))
  const timeSig = project.timeSig
  const length = bars * timeSig
  const random = makeRandom(options.seed ?? Math.floor(Math.random() * 1_000_000_000))
  const scale = scaleFor(project)
  const rootMidi = 48 + keyPitchClass(project.key)
  const degreeMidi = (degree: number, octaveShift = 0) => {
    const normalized = ((degree % 7) + 7) % 7
    const octave = Math.floor(degree / 7)
    return rootMidi + scale[normalized] + octave * 12 + octaveShift * 12
  }
  const chordNotes = (degree: number, octaveShift = 0) => {
    const steps = style.seventh ? [0, 2, 4, 6] : [0, 2, 4]
    return steps.map((step) => fitPitch(degreeMidi(degree + step, octaveShift), 36, 88))
  }
  const bassPitch = (degree: number, step = 0) =>
    fitPitch(degreeMidi(degree + step, -1), 28, 54)
  const melodyPitch = (degree: number, offset = 0) =>
    fitPitch(degreeMidi(degree + offset, style.melodyOctave), 48, 90)

  const roles: Role[] = style.drums ? ['drums', 'bass', 'chords', 'texture', 'melody'] : ['bass', 'chords', 'texture', 'melody']
  const chosenTracks = new Map<Role, Track>()
  const usedTrackIds = new Set<string>()
  if (options.placement === 'fresh') {
    for (const role of roles) {
      const instrument = role === 'drums' ? style.drums! : style[role]
      chosenTracks.set(role, makeTrack(project, style, role, instrument))
    }
  } else {
    for (const role of roles) {
      const existing = project.tracks.find(
        (track) => !usedTrackIds.has(track.id) && roleHasInstrument(role, track.instrument),
      )
      if (existing) {
        chosenTracks.set(role, existing)
        usedTrackIds.add(existing.id)
      } else {
        const instrument = role === 'drums' ? style.drums! : style[role]
        chosenTracks.set(role, makeTrack(project, style, role, instrument))
      }
    }
  }

  const targetTracks = [...chosenTracks.values()]
  let start = 0
  if (options.placement === 'fresh') {
    start = 0
  } else if (options.placement === 'end') {
    start = Math.ceil(projectEnd(project) / timeSig) * timeSig
  } else {
    start = Math.max(0, Math.floor(options.playhead / timeSig) * timeSig)
    for (let attempt = 0; attempt < 12; attempt++) {
      const conflicts = targetTracks.flatMap((track) => track.clips).filter(
        (clip) => clip.start < start + length && clip.start + clip.length > start,
      )
      if (!conflicts.length) break
      const end = Math.max(...conflicts.map((clip) => clip.start + clip.length))
      start = Math.ceil(end / timeSig) * timeSig
    }
  }

  const buildClip = (role: Role): Clip => {
    const builder = makeVoiceBuilder(length)
    const chordMode = style.chordMode
    const bassMode = style.bassMode

    if (role === 'drums') {
      for (let bar = 0; bar < bars; bar++) {
        const base = bar * timeSig
        const beats = timeSig
        const push = (at: number, pitch: number, velocity: number) => {
          if (at < beats - 1e-6) builder.add(base + at, pitch, 0.22, velocity)
        }
        if (style.drumMode === 'four') {
          for (let beat = 0; beat < beats; beat++) push(beat, 36, beat === 0 ? 0.95 : 0.82)
          if (beats >= 3) {
            push(1, 39, 0.72)
            push(beats - 1, 39, 0.72)
          }
          for (let step = 0; step < beats; step += 0.5) push(step, 42, step % 1 === 0 ? 0.62 : 0.4)
          for (let step = 0.5; step < beats; step += 1) push(step, 46, 0.34)
        } else if (style.drumMode === 'lofi') {
          push(0, 36, 0.92)
          push(2.5, 36, 0.72)
          push(1, 38, 0.78)
          push(3, 38, 0.8)
          for (let step = 0; step < beats; step += 0.5) {
            push(step, 42, step % 1 === 0 ? 0.58 : 0.38)
          }
          push(3.5, 46, 0.3)
        } else if (style.drumMode === 'pop') {
          push(0, 36, 0.9)
          push(2.5, 36, 0.76)
          push(1, 38, 0.82)
          push(3, 38, 0.86)
          for (let step = 0; step < beats; step += 0.5) push(step, 42, step % 1 === 0 ? 0.56 : 0.36)
          if (bar === 0) push(0, 49, 0.7)
        } else if (style.drumMode === 'jazz') {
          for (let step = 0; step < beats; step += 1) push(step, 51, 0.48)
          push(0.5, 51, 0.3)
          push(1.5, 51, 0.34)
          push(2.5, 51, 0.3)
          push(1, 38, 0.38)
          push(3, 38, 0.42)
          push(0, 36, 0.42)
          push(2.5, 36, 0.32)
        } else {
          push(0, 36, 0.55)
          push(2, 37, 0.32)
          push(0.75, 42, 0.26)
          push(2.75, 42, 0.24)
          if (bar === 0) push(0, 49, 0.3)
        }
      }
    } else if (role === 'chords' || role === 'texture') {
      for (let bar = 0; bar < bars; bar++) {
        const base = bar * timeSig
        const degree = style.progression[bar % style.progression.length]
        const isTexture = role === 'texture'
        const octave = isTexture ? 1 : 0
        const hits =
          isTexture || chordMode === 'long'
            ? [{ at: 0, duration: timeSig, velocity: 0.38 }]
            : chordMode === 'house'
              ? [0, 1, 2, 3].filter((at) => at < timeSig).map((at) => ({ at, duration: 0.42, velocity: 0.5 }))
              : chordMode === 'pop'
                ? [0, 2].filter((at) => at < timeSig).map((at) => ({ at, duration: 1.4, velocity: 0.55 }))
                : chordMode === 'jazz'
                  ? [0, 1.5].filter((at) => at < timeSig).map((at) => ({ at, duration: 0.8, velocity: 0.46 }))
                  : [0, 1.5].filter((at) => at < timeSig).map((at) => ({ at, duration: 1.2, velocity: 0.5 }))
        const pitches = chordNotes(degree, octave)
        for (const hit of hits) {
          for (const pitch of pitches) {
            builder.add(base + hit.at, pitch, hit.duration, hit.velocity * (0.9 + random() * 0.15))
          }
        }
      }
    } else if (role === 'bass') {
      for (let bar = 0; bar < bars; bar++) {
        const base = bar * timeSig
        const degree = style.progression[bar % style.progression.length]
        if (bassMode === 'walking') {
          const steps = [0, 2, 4, 6]
          for (let index = 0; index < Math.min(timeSig, 4); index++) {
            builder.add(base + index, bassPitch(degree, steps[index]), 0.42, 0.6 + random() * 0.08)
          }
        } else if (bassMode === 'house') {
          for (let step = 0; step < timeSig; step += 0.5) {
            const octave = Math.round(step * 2) % 2 === 0 ? 0 : 7
            builder.add(base + step, bassPitch(degree, octave), 0.3, step % 1 === 0 ? 0.68 : 0.5)
          }
        } else if (bassMode === 'pop') {
          for (const step of [0, 0.75, 2, 2.75]) {
            if (step < timeSig) builder.add(base + step, bassPitch(degree, step === 0.75 ? 4 : 0), 0.4, 0.58)
          }
        } else if (bassMode === 'lofi') {
          builder.add(base, bassPitch(degree, 0), Math.min(1.8, timeSig), 0.64)
          if (timeSig > 2) builder.add(base + 2.5, bassPitch(degree, 4), 0.5, 0.5)
        } else {
          builder.add(base, bassPitch(degree, 0), timeSig, 0.55)
          if (timeSig > 2) builder.add(base + timeSig - 0.5, bassPitch(degree, 4), 0.42, 0.42)
        }
      }
    } else {
      // Melody
      const positions =
        style.melodyMode === 'house'
          ? [0, 0.75, 1.5, 2.5, 3]
          : style.melodyMode === 'pop'
            ? [0, 0.5, 1.5, 2, 2.75, 3.5]
            : style.melodyMode === 'ambient' || style.melodyMode === 'cinematic'
              ? [0, 2.5]
              : style.melodyMode === 'jazz'
                ? [0, 0.75, 1.5, 2.5, 3.25]
                : [0, 1.5, 2.5, 3.5]
      const motif = positions
        .filter((position) => position < timeSig && random() > 0.16)
        .map((position, index) => ({
          position,
          offset: [0, 2, 4, 6, 1, 3, 5][index % 7],
          velocity: 0.55 + random() * 0.18,
        }))
      for (let pair = 0; pair < Math.ceil(bars / 2); pair++) {
        const bar = pair * 2
        if (bar >= bars) break
        const degree = style.progression[bar % style.progression.length]
        const variation = pair % 2 === 1 ? 1 : 0
        for (const [index, event] of motif.entries()) {
          if (bar + 1 < bars && event.position >= timeSig) continue
          const offset = event.offset + (variation && index === motif.length - 1 ? 2 : 0)
          const pitch = melodyPitch(degree, offset)
          const at = bar * timeSig + event.position + (variation ? 0 : 0)
          const duration = style.melodyMode === 'ambient' || style.melodyMode === 'cinematic' ? 1.6 : 0.42
          builder.add(at, pitch, duration, event.velocity)
        }
      }
    }

    return {
      id: uid('c'),
      name: `${style.label} ${ROLE_LABELS[role]}`,
      start,
      length,
      notes: builder.notes,
    }
  }

  const generatedTracks = new Map<Role, Track>()
  for (const [role, track] of chosenTracks) {
    const clip = buildClip(role)
    generatedTracks.set(role, { ...track, clips: [...track.clips, clip] })
  }

  const section: Section = {
    id: uid('s'),
    name: `${style.label} ${bars} bars`,
    start,
    length,
    color: style.color,
  }

  let nextProject: Project
  if (options.placement === 'fresh') {
    const freshTracks = [...generatedTracks.values()]
    nextProject = {
      ...project,
      name: `${style.label} Sketch`,
      bpm: style.bpm,
      lengthBeats: Math.max(length, timeSig * 4),
      tracks: freshTracks,
      sections: [section],
      loop: { enabled: false, start: 0, end: length },
      swing: style.swing ?? { enabled: false, amount: 50, division: 8 },
      master: { volume: 0.8, reverb: 0.28, delay: 0.16, effects: [] },
    }
  } else {
    const generatedById = new Map(
      [...generatedTracks.entries()].map(([role, track]) => [chosenTracks.get(role)!.id, track]),
    )
    const updatedTracks = project.tracks.map((track) => generatedById.get(track.id) ?? track)
    const newTracks = [...generatedTracks.values()].filter((track) => !project.tracks.some((item) => item.id === track.id))
    nextProject = {
      ...project,
      tracks: [...updatedTracks, ...newTracks],
      lengthBeats: Math.max(project.lengthBeats, start + length),
      sections: project.sections.some((item) => item.start === start && item.name === section.name)
        ? project.sections
        : [...project.sections, section],
    }
  }

  const focusRole: Role = generatedTracks.has('melody') ? 'melody' : generatedTracks.has('chords') ? 'chords' : 'drums'
  const focusTrack = generatedTracks.get(focusRole) ?? null
  const focusClip = focusTrack?.clips[focusTrack.clips.length - 1] ?? null
  return {
    project: nextProject,
    startBeat: start,
    lengthBeats: length,
    summary: `${style.label} · ${bars} bars${style.drums ? '' : ' · no drums'}`,
    focusTrackId: focusTrack?.id ?? null,
    focusClipId: focusClip?.id ?? null,
  }
}
