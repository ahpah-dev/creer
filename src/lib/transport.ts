import { engine } from '../audio/engine'
import { useProjectStore } from '../store/project'
import { useSessionStore } from '../store/session'
import { clamp } from './utils'

export const syncEngineProject = () => {
  engine.attach(useProjectStore.getState().project)
}

export const playTransport = async () => {
  syncEngineProject()
  const session = useSessionStore.getState()
  const started = await engine.play()
  if (started) {
    session.setPlaying(true)
    session.setPausedBeat(engine.getPosition())
  }
}

export const pauseTransport = () => {
  const session = useSessionStore.getState()
  engine.stop()
  session.setPlaying(false)
  session.setPausedBeat(engine.getPosition())
}

export const togglePlayback = async () => {
  const session = useSessionStore.getState()
  if (session.isPlaying) pauseTransport()
  else await playTransport()
}

export const stopTransport = () => {
  const session = useSessionStore.getState()
  engine.stop()
  session.setPlaying(false)
  session.setPausedBeat(engine.getPosition())
}

export const seekTo = (beat: number) => {
  const session = useSessionStore.getState()
  const project = useProjectStore.getState().project
  const position = clamp(beat, 0, engine.getLength() || project.lengthBeats)
  engine.seek(position)
  session.setPausedBeat(position)
}

export const rewindTransport = () => {
  const project = useProjectStore.getState().project
  const session = useSessionStore.getState()
  const start = project.loop.enabled ? project.loop.start : 0
  engine.seek(start)
  session.setPausedBeat(start)
}

export const toggleLoop = () => {
  const store = useProjectStore.getState()
  const project = store.project
  const enabled = !project.loop.enabled
  const session = useSessionStore.getState()
  const loop = { ...project.loop, enabled }
  store.updateProject({ loop })
  if (enabled) {
    const beat = session.isPlaying ? engine.getPosition() : session.pausedBeat
    if (beat < loop.start || beat >= loop.end) {
      seekTo(loop.start)
    }
  }
  session.toast(
    enabled ? 'Loop on' : 'Loop off',
    enabled ? 'The playhead will cycle the highlighted bars.' : undefined,
  )
}

export const toggleMetronome = () => {
  const session = useSessionStore.getState()
  const enabled = !session.metronome
  session.setMetronome(enabled)
  engine.setMetronome(enabled)
}

export const toggleMute = (trackId: string) => {
  const store = useProjectStore.getState()
  const track = store.project.tracks.find((item) => item.id === trackId)
  if (!track) return
  store.updateTrack(trackId, { mute: !track.mute })
}

export const toggleSolo = (trackId: string) => {
  const store = useProjectStore.getState()
  const track = store.project.tracks.find((item) => item.id === trackId)
  if (!track) return
  store.updateTrack(trackId, { solo: !track.solo })
}

export const setArmedTrack = (trackId: string) => {
  const store = useProjectStore.getState()
  store.apply((project) => ({
    ...project,
    tracks: project.tracks.map((track) => ({ ...track, armed: track.id === trackId ? !track.armed : false })),
  }))
}

export const getCurrentBeat = () => {
  const session = useSessionStore.getState()
  return session.isPlaying ? engine.getPosition() : session.pausedBeat
}
