import { engine } from '../audio/engine'
import { useProjectStore } from '../store/project'
import { useSessionStore } from '../store/session'
import type { Note } from '../types'
import { getCurrentBeat, syncEngineProject } from './transport'
import { resolveUseMobile } from './device'
import { uid } from './utils'

interface ActiveCapture {
  pitch: number
  start: number
  velocity: number
}

interface RecordingState {
  trackId: string
  clipId: string
  clipStart: number
  active: Map<string, ActiveCapture>
  notes: Note[]
  restoreLoop: boolean
}

let state: RecordingState | null = null
let captureCounter = 0

export const isCapturing = () => Boolean(state)

export const startRecording = async () => {
  const session = useSessionStore.getState()
  const store = useProjectStore.getState()
  const project = store.project
  if (!project.tracks.length) {
    session.toast('Add a track first', 'Create an instrument track, then record something.', 'warn')
    return
  }
  const track =
    project.tracks.find((item) => item.armed) ??
    project.tracks.find((item) => item.id === store.selectedTrackId) ??
    project.tracks[0]

  const current = getCurrentBeat()
  engine.stop()
  session.setPlaying(false)
  session.setPausedBeat(current)
  const recordStart = Math.max(0, Math.floor(current / 0.25) * 0.25)
  const restoreLoop = project.loop.enabled
  if (restoreLoop) {
    store.updateProject({ loop: { ...project.loop, enabled: false } }, { history: false })
  }

  const length = project.timeSig * 4
  const takeNumber =
    track.clips.filter((existing) => /^Take \d+/.test(existing.name)).length + 1
  const clip = {
    id: uid('c'),
    name: `Take ${takeNumber}`,
    start: recordStart,
    length,
    notes: [] as Note[],
  }
  store.addClip(track.id, clip)
  store.updateTrack(track.id, { armed: true })
  session.setDock('keys')
  session.setDockCollapsed(false)
  session.setSelectedNoteIds([])

  state = {
    trackId: track.id,
    clipId: clip.id,
    clipStart: recordStart,
    active: new Map(),
    notes: [],
    restoreLoop,
  }
  session.setRecording(true)
  syncEngineProject()
  const started = await engine.play(recordStart)
  if (!started) {
    session.setRecording(false)
    state = null
    session.toast('Audio could not start', 'Check your browser audio permissions and try again.', 'warn')
    return
  }
  session.setPlaying(true)
  session.setPausedBeat(recordStart)
  const stopHint = resolveUseMobile() ? 'Tap record again to stop.' : 'Space or the record button stops the take.'
  session.toast(
    'Recording',
    restoreLoop
      ? `Loop paused for the take. Play the pads or keys. ${stopHint}`
      : `Play the pads or keys. ${stopHint}`,
    'default',
  )
}

export const captureNoteStart = (pitch: number, velocity = 0.8) => {
  if (!state) return null
  const position = engine.getPosition()
  const start = Math.max(0, position - state.clipStart)
  const token = `take_${captureCounter++}`
  state.active.set(token, { pitch, start, velocity })
  return token
}

export const captureNoteEnd = (token: string | null) => {
  if (!state || !token) return
  const capture = state.active.get(token)
  if (!capture) return
  state.active.delete(token)
  const position = engine.getPosition()
  const end = Math.max(capture.start + 0.12, position - state.clipStart)
  state.notes.push({
    id: uid('n'),
    pitch: capture.pitch,
    start: Number(capture.start.toFixed(3)),
    duration: Number(Math.max(0.12, end - capture.start).toFixed(3)),
    velocity: capture.velocity,
  })
}

export const stopRecording = () => {
  const session = useSessionStore.getState()
  const store = useProjectStore.getState()
  if (!state) {
    session.setRecording(false)
    return
  }
  const capture = state
  const position = engine.getPosition()
  for (const [token, note] of capture.active) {
    const end = Math.max(note.start + 0.12, position - capture.clipStart)
    capture.notes.push({
      id: uid('n'),
      pitch: note.pitch,
      start: Number(note.start.toFixed(3)),
      duration: Number(Math.max(0.12, end - note.start).toFixed(3)),
      velocity: note.velocity,
    })
    capture.active.delete(token)
  }
  capture.active.clear()
  state = null
  engine.stop()
  session.setPlaying(false)
  session.setRecording(false)
  session.setPausedBeat(engine.getPosition())

  const project = store.project
  const notes = capture.notes.sort((a, b) => a.start - b.start)
  if (notes.length) {
    const lastEnd = notes.reduce((max, note) => Math.max(max, note.start + note.duration), 0)
    const bars = Math.max(4, Math.ceil(lastEnd / project.timeSig))
    store.updateClip(capture.trackId, capture.clipId, {
      notes,
      length: bars * project.timeSig,
    }, { history: false })
    store.selectClip(capture.trackId, capture.clipId)
    session.setDock('editor')
    session.toast('Take recorded', `${notes.length} note${notes.length === 1 ? '' : 's'} captured. Try Quantize in the editor.`, 'success')
  } else {
    store.deleteClip(capture.trackId, capture.clipId)
    session.setDock('keys')
    session.toast('Nothing captured', 'The take was empty, so the clip was removed.')
  }
  if (capture.restoreLoop) {
    const loop = useProjectStore.getState().project.loop
    store.updateProject({ loop: { ...loop, enabled: true } }, { history: false })
  }
  syncEngineProject()
}

export const toggleRecording = async () => {
  const session = useSessionStore.getState()
  if (state || session.isRecording) {
    stopRecording()
  } else {
    await startRecording()
  }
}
