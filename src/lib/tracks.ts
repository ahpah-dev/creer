import type { InstrumentId, LoopDef, Track } from '../types'
import { INSTRUMENT_MAP } from '../data/instruments'
import { useProjectStore } from '../store/project'
import { useSessionStore } from '../store/session'
import { getCurrentBeat } from './transport'
import { TRACK_COLORS, keyPitchClass, transposeNotesToKey, uid } from './utils'
import { makeClip } from './clips'

const defaults: Record<InstrumentId, { volume: number; reverb: number; delay: number }> = {
  piano: { volume: 0.7, reverb: 0.25, delay: 0.1 },
  electric: { volume: 0.66, reverb: 0.2, delay: 0.12 },
  pad: { volume: 0.5, reverb: 0.42, delay: 0.06 },
  bass: { volume: 0.78, reverb: 0.04, delay: 0.02 },
  pluck: { volume: 0.64, reverb: 0.24, delay: 0.2 },
  bell: { volume: 0.42, reverb: 0.36, delay: 0.08 },
  strings: { volume: 0.52, reverb: 0.38, delay: 0.05 },
  organ: { volume: 0.6, reverb: 0.2, delay: 0.04 },
  marimba: { volume: 0.62, reverb: 0.22, delay: 0.08 },
  drums: { volume: 0.84, reverb: 0.08, delay: 0.03 },
}

export const createTrack = (
  instrument: InstrumentId,
  options: { name?: string; color?: string; index?: number; arm?: boolean } = {},
): Track => {
  const info = INSTRUMENT_MAP[instrument]
  const project = useProjectStore.getState().project
  const existingNames = new Set(project.tracks.map((track) => track.name))
  let baseName = options.name?.trim() || info.name
  if (existingNames.has(baseName)) {
    let counter = 2
    while (existingNames.has(`${baseName} ${counter}`)) counter++
    baseName = `${baseName} ${counter}`
  }
  const palette = TRACK_COLORS[options.index ?? project.tracks.length % TRACK_COLORS.length]
  const settings = defaults[instrument]
  return {
    id: uid('t'),
    name: baseName,
    instrument,
    color: options.color ?? (instrument === 'drums' ? '#dd876f' : palette.value),
    volume: settings.volume,
    pan: instrument === 'pad' ? 0.12 : instrument === 'pluck' ? -0.16 : 0,
    mute: false,
    solo: false,
    armed: options.arm ?? false,
    reverbSend: settings.reverb,
    delaySend: settings.delay,
    clips: [],
  }
}

export const addTrackWithStarterClip = (
  instrument: InstrumentId,
  options: { name?: string; color?: string; starterClip?: boolean } = {},
) => {
  const store = useProjectStore.getState()
  const session = useSessionStore.getState()
  const project = store.project
  const track = createTrack(instrument, { ...options, arm: true })
  track.armed = false
  store.apply((current) => ({
    ...current,
    tracks: [
      ...current.tracks.map((item) => ({ ...item, armed: false })),
      track,
    ],
    lengthBeats: Math.max(current.lengthBeats, 32),
  }))
  useProjectStore.setState({ selectedTrackId: track.id, selectedClipId: null })
  if (options.starterClip !== false) {
    const beat = getCurrentBeat()
    const snapped = Math.max(0, Math.floor(beat / project.timeSig) * project.timeSig)
    const clip = makeClip('New idea', snapped, project.timeSig * 4)
    store.addClip(track.id, clip)
    session.setDock('editor')
    session.setSelectedNoteIds([])
    session.toast('Track created', `"${track.name}" is ready — draw something in the piano roll.`, 'success')
  } else {
    session.toast('Track created', `"${track.name}" was added to the session.`, 'success')
  }
  return track
}

export const addLoopToProject = (loop: LoopDef) => {
  const store = useProjectStore.getState()
  const session = useSessionStore.getState()
  const project = store.project
  const beats = getCurrentBeat()
  const snapped = Math.max(0, Math.floor(beats / project.timeSig) * project.timeSig)
  let target = project.tracks.find((track) => track.id === store.selectedTrackId && track.instrument === loop.instrument)
  if (!target) target = project.tracks.find((track) => track.instrument === loop.instrument)
  if (!target) {
    target = createTrack(loop.instrument, {
      name: INSTRUMENT_MAP[loop.instrument].name,
      color: loop.color,
    })
    store.addTrack(target)
  }
  const notes =
    loop.instrument === 'drums'
      ? loop.notes
      : transposeNotesToKey(loop.notes, 'A', project.key ?? KEY_REF)
  const clip = makeClip(loop.name, snapped, loop.lengthBeats)
  clip.notes = notes.map((note) => ({ ...note, id: uid('n') }))
  clip.name = loop.name
  store.addClip(target.id, clip)
  session.setDock('editor')
  session.setSelectedNoteIds([])
  session.toast('Loop added', `"${loop.name}" landed on ${target.name}.`, 'success')
  return { track: target, clip }
}

const KEY_REF = 'A'

export const moveClipBetweenTracks = (
  sourceTrackId: string,
  targetTrackId: string,
  clipId: string,
  start: number,
  length: number,
) => {
  const store = useProjectStore.getState()
  if (sourceTrackId === targetTrackId) {
    store.updateClip(sourceTrackId, clipId, { start, length })
    return
  }
  store.apply((project) => {
    const source = project.tracks.find((track) => track.id === sourceTrackId)
    const clip = source?.clips.find((item) => item.id === clipId)
    if (!clip) return project
    return {
      ...project,
      tracks: project.tracks.map((track) => {
        if (track.id === sourceTrackId) {
          return { ...track, clips: track.clips.filter((item) => item.id !== clipId) }
        }
        if (track.id === targetTrackId) {
          return { ...track, clips: [...track.clips, { ...clip, start, length }] }
        }
        return track
      }),
      lengthBeats: Math.max(project.lengthBeats, start + length),
    }
  })
}

export const transposeTrackClips = (track: Track, semitones: number): Track => ({
  ...track,
  clips: track.clips.map((clip) => ({
    ...clip,
    notes: clip.notes.map((note) => ({ ...note, pitch: Math.max(0, Math.min(127, note.pitch + semitones)) })),
  })),
})

export const keyPitchClassForProject = (key: string) => keyPitchClass(key)
