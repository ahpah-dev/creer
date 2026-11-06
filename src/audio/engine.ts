import type { InstrumentId, Note, Project, Track } from '../types'
import { clamp, projectEnd } from '../lib/utils'
import {
  createMasterBus,
  createTrackBus,
  readAnalyserLevel,
  type MasterBus,
  type TrackBus,
} from './graph'
import { triggerNote, type VoiceHandle } from './synth'

interface NoteEvent {
  beat: number
  durationBeats: number
  pitch: number
  velocity: number
  trackId: string
  instrument: InstrumentId
}

const LOOKAHEAD = 0.16
const TICK_MS = 24

export class AudioEngine {
  ctx: AudioContext | null = null
  private master: MasterBus | null = null
  private buses = new Map<string, TrackBus>()
  private project: Project | null = null
  private events: NoteEvent[] = []
  private songEnd = 64
  private activeVoices = new Set<VoiceHandle>()
  private metronomeVoices = new Set<AudioScheduledSourceNode>()
  private tickTimer: number | null = null
  private endTimer: number | null = null
  private schedBeat = 0
  private schedTime = 0
  private anchorBeat = 0
  private anchorTime = 0
  private pausedBeat = 0
  private playing = false
  private metronome = false
  private levelData = new Uint8Array(256)
  private masterLevelData = new Uint8Array(512)
  private previewGain: GainNode | null = null
  private previewVoices = new Set<VoiceHandle>()
  private previewTimer: number | null = null
  private previewEndsAt = 0
  private liveVoices = new Map<string, { handle: VoiceHandle; sourceTrack: string }>()
  private tempVoiceCounter = 0
  private liveGain: GainNode | null = null

  onEnd: (() => void) | null = null
  onPreviewEnd: (() => void) | null = null

  attach(project: Project) {
    const previous = this.project
    const wasPlaying = this.playing
    const position = this.getPosition()
    const loopChanged =
      previous &&
      (previous.loop.enabled !== project.loop.enabled ||
        previous.loop.start !== project.loop.start ||
        previous.loop.end !== project.loop.end ||
        previous.bpm !== project.bpm)
    this.project = project
    this.songEnd = projectEnd(project)
    this.events = this.buildEvents(project)
    if (!this.ctx) return
    if (this.master) {
      this.master.setVolume(project.master.volume)
      this.master.setReverb(project.master.reverb)
      this.master.setDelay(project.master.delay)
      this.master.setDelayTime((60 / Math.max(40, project.bpm)) * 0.75)
    }
    this.syncTrackBuses()
    if (wasPlaying && loopChanged) {
      this.beginPlayback(position)
    } else if (wasPlaying && !project.loop.enabled) {
      this.armEndTimer()
    }
  }

  setMetronome(enabled: boolean) {
    this.metronome = enabled
  }

  get isPlaying() {
    return this.playing
  }

  getPosition(): number {
    if (!this.playing || !this.ctx || !this.project) return this.pausedBeat
    const elapsed = this.ctx.currentTime - this.anchorTime
    if (elapsed <= 0) return this.anchorBeat
    const rate = this.project.bpm / 60
    const raw = this.anchorBeat + elapsed * rate
    if (this.project.loop.enabled) {
      const { start, end } = this.project.loop
      const span = Math.max(0.25, end - start)
      const offset = this.anchorBeat - start + elapsed * rate
      return start + ((offset % span) + span) % span
    }
    return clamp(raw, 0, this.songEnd)
  }

  getLength() {
    return this.songEnd
  }

  async ensureContext() {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new Ctor({ latencyHint: 'interactive' })
      if (this.project) {
        this.master = createMasterBus(this.ctx, this.ctx.destination, this.project.master, this.project.bpm)
        this.syncTrackBuses()
        this.project = this.project
      }
      this.liveGain = this.ctx.createGain()
      this.liveGain.gain.value = 0.9
      if (this.master) this.liveGain.connect(this.master.input)
    }
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume()
      } catch {
        /* audio may be blocked until a gesture */
      }
    }
    return this.ctx
  }

  async play(startBeat?: number): Promise<boolean> {
    await this.ensureContext()
    if (!this.project) return false
    let from = startBeat ?? this.pausedBeat
    if (this.project.loop.enabled) {
      const { start, end } = this.project.loop
      if (from < start || from >= end - 0.001) from = start
    }
    if (from >= this.songEnd - 0.02) from = 0
    this.beginPlayback(from)
    return true
  }

  stop() {
    if (!this.ctx) return
    const position = this.getPosition()
    this.playing = false
    this.pausedBeat = this.project?.loop.enabled ? position : clamp(position, 0, this.songEnd)
    this.clearTimers()
    this.stopAllVoices()
  }

  finish() {
    this.stop()
    this.onEnd?.()
  }

  seek(beat: number) {
    const target = clamp(beat, 0, this.songEnd)
    this.pausedBeat = target
    if (this.playing) {
      this.beginPlayback(target)
    }
  }

  toggleLoopAtPlayhead() {
    // The UI updates the project; attach() will restart playback if necessary.
  }

  private clearTimers() {
    if (this.tickTimer !== null) {
      window.clearInterval(this.tickTimer)
      this.tickTimer = null
    }
    if (this.endTimer !== null) {
      window.clearTimeout(this.endTimer)
      this.endTimer = null
    }
  }

  private beginPlayback(startBeat: number) {
    if (!this.ctx || !this.project) return
    this.stopAllVoices()
    this.clearTimers()
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    const loop = this.project.loop
    if (loop.enabled) {
      startBeat = clamp(startBeat, loop.start, Math.max(loop.start, loop.end - 0.001))
    }
    this.playing = true
    this.anchorBeat = startBeat
    this.anchorTime = this.ctx.currentTime + 0.075
    this.schedBeat = startBeat
    this.schedTime = this.anchorTime
    this.pausedBeat = startBeat
    this.scheduleAhead()
    this.tickTimer = window.setInterval(() => this.tick(), TICK_MS)
    this.armEndTimer()
  }

  private armEndTimer() {
    if (!this.ctx || !this.project) return
    if (this.endTimer !== null) {
      window.clearTimeout(this.endTimer)
      this.endTimer = null
    }
    if (this.project.loop.enabled) return
    const remaining = Math.max(0, this.songEnd - this.getPosition())
    const seconds = remaining / (this.project.bpm / 60)
    this.endTimer = window.setTimeout(() => {
      if (this.playing) this.finish()
    }, (seconds + 0.35) * 1000)
  }

  private tick() {
    if (!this.playing || !this.ctx) return
    this.pruneVoices()
    this.scheduleAhead()
  }

  private scheduleAhead() {
    if (!this.ctx || !this.project) return
    const horizon = this.ctx.currentTime + LOOKAHEAD
    const rate = this.project.bpm / 60
    let guard = 0
    while (this.schedTime < horizon && guard++ < 24) {
      const loop = this.project.loop
      let boundaryBeat = this.songEnd
      if (loop.enabled) boundaryBeat = Math.min(loop.end, this.songEnd)
      if (loop.enabled && this.schedBeat >= boundaryBeat - 1e-7) {
        this.schedBeat = loop.start
      }
      const timeToBoundary = Math.max(0, boundaryBeat - this.schedBeat) / rate
      const segmentEndTime = Math.min(horizon, this.schedTime + timeToBoundary)
      const segmentEndBeat = this.schedBeat + (segmentEndTime - this.schedTime) * rate
      this.scheduleRange(this.schedBeat, segmentEndBeat, this.schedTime)
      const progressed = segmentEndBeat > this.schedBeat + 1e-8 || segmentEndTime > this.schedTime + 1e-8
      this.schedBeat = segmentEndBeat
      this.schedTime = segmentEndTime
      if (segmentEndTime >= horizon - 1e-6) break
      if (loop.enabled) {
        if (this.schedBeat >= boundaryBeat - 1e-6) {
          this.schedBeat = loop.start
        } else if (!progressed) {
          break
        }
      } else {
        break
      }
    }
  }

  private scheduleRange(fromBeat: number, toBeat: number, startTime: number) {
    if (!this.ctx || !this.project || toBeat <= fromBeat + 1e-9) {
      return
    }
    const secondsPerBeat = 60 / this.project.bpm
    const events = this.events
    let low = 0
    let high = events.length
    while (low < high) {
      const mid = (low + high) >> 1
      if (events[mid].beat < fromBeat - 1e-8) low = mid + 1
      else high = mid
    }
    for (let i = low; i < events.length; i++) {
      const event = events[i]
      if (event.beat >= toBeat - 1e-8) break
      if (event.beat < fromBeat - 1e-8) continue
      const bus = this.buses.get(event.trackId)
      if (!bus) continue
      const when = startTime + Math.max(0, event.beat - fromBeat) * secondsPerBeat
      const duration = Math.max(0.03, event.durationBeats * secondsPerBeat)
      const voice = triggerNote(
        this.ctx,
        bus.input,
        event.instrument,
        event.pitch,
        when,
        duration,
        event.velocity,
      )
      this.activeVoices.add(voice)
    }

    if (this.metronome) {
      const first = Math.ceil(fromBeat - 1e-7)
      for (let beat = first; beat < toBeat - 1e-8; beat++) {
        const when = startTime + Math.max(0, beat - fromBeat) * secondsPerBeat
        this.scheduleClick(when, beat % this.project.timeSig === 0)
      }
    }
  }

  private scheduleClick(when: number, accent: boolean) {
    if (!this.ctx) return
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = accent ? 1760 : 1120
    gain.gain.setValueAtTime(0.0001, when)
    gain.gain.exponentialRampToValueAtTime(accent ? 0.14 : 0.07, when + 0.002)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.055)
    osc.connect(gain)
    gain.connect(this.ctx.destination)
    osc.start(when)
    osc.stop(when + 0.07)
    this.metronomeVoices.add(osc)
    osc.onended = () => {
      this.metronomeVoices.delete(osc)
      try {
        gain.disconnect()
      } catch {
        /* noop */
      }
    }
  }

  private stopAllVoices() {
    for (const voice of this.activeVoices) voice.stop()
    this.activeVoices.clear()
    for (const voice of this.previewVoices) voice.stop()
    this.previewVoices.clear()
    for (const source of this.metronomeVoices) {
      try {
        source.stop()
      } catch {
        /* noop */
      }
    }
    this.metronomeVoices.clear()
    for (const [, entry] of this.liveVoices) entry.handle.stop()
    this.liveVoices.clear()
  }

  private pruneVoices() {
    if (!this.ctx) return
    const now = this.ctx.currentTime
    for (const voice of this.activeVoices) {
      if (voice.endsAt < now - 0.5) this.activeVoices.delete(voice)
    }
    for (const voice of this.previewVoices) {
      if (voice.endsAt < now - 0.5) this.previewVoices.delete(voice)
    }
    if (this.previewEndsAt && now > this.previewEndsAt + 0.4) {
      this.previewEndsAt = 0
      this.stopPreview()
    }
  }

  private buildEvents(project: Project): NoteEvent[] {
    const events: NoteEvent[] = []
    for (const track of project.tracks) {
      for (const clip of track.clips) {
        for (const note of clip.notes) {
          if (note.start < 0 || note.start >= clip.length - 1e-7) continue
          events.push({
            beat: clip.start + note.start,
            durationBeats: Math.max(0.03, note.duration),
            pitch: note.pitch,
            velocity: note.velocity,
            trackId: track.id,
            instrument: track.instrument,
          })
        }
      }
    }
    events.sort((a, b) => a.beat - b.beat)
    return events
  }

  private syncTrackBuses() {
    if (!this.ctx || !this.master || !this.project) return
    const hasSolo = this.project.tracks.some((track) => track.solo)
    const ids = new Set(this.project.tracks.map((track) => track.id))
    for (const [id, bus] of this.buses) {
      if (!ids.has(id)) {
        try {
          bus.input.disconnect()
          bus.panner.disconnect()
          bus.analyser.disconnect()
          bus.reverbSend.disconnect()
          bus.delaySend.disconnect()
        } catch {
          /* noop */
        }
        this.buses.delete(id)
      }
    }
    for (const track of this.project.tracks) {
      let bus = this.buses.get(track.id)
      if (!bus) {
        bus = createTrackBus(this.ctx, this.master, track)
        this.buses.set(track.id, bus)
      }
      const audible = !track.mute && (!hasSolo || track.solo)
      bus.setVolume(audible ? track.volume : 0)
      bus.setPan(track.pan)
      bus.setSends(track.reverbSend, track.delaySend)
    }
  }

  getTrackLevel(trackId: string) {
    const bus = this.buses.get(trackId)
    if (!bus) return { rms: 0, peak: 0 }
    return readAnalyserLevel(bus.analyser, this.levelData)
  }

  getMasterLevel() {
    if (!this.master) return { rms: 0, peak: 0 }
    return readAnalyserLevel(this.master.analyser, this.masterLevelData)
  }

  async noteOn(instrument: InstrumentId, trackId: string, pitch: number, velocity = 0.8) {
    const ctx = await this.ensureContext()
    if (!ctx) return null
    const bus = this.buses.get(trackId)
    const destination = bus?.input ?? this.liveGain
    if (!destination) return null
    const when = ctx.currentTime + 0.015
    const voice = triggerNote(ctx, destination, instrument, pitch, when, 30, velocity)
    const key = `live_${this.tempVoiceCounter++}`
    this.liveVoices.set(key, { handle: voice, sourceTrack: trackId })
    return key
  }

  noteOff(key: string | null) {
    if (!key) return
    const entry = this.liveVoices.get(key)
    if (entry) {
      entry.handle.stop()
      this.liveVoices.delete(key)
    }
  }

  async previewNotes(
    instrument: InstrumentId,
    notes: Omit<Note, 'id'>[],
    bpm: number,
    lengthBeats: number,
    onEnd?: () => void,
  ) {
    const ctx = await this.ensureContext()
    if (!ctx || !this.master) return
    this.stopPreview()
    const gain = ctx.createGain()
    gain.gain.value = 0.82
    gain.connect(this.master.input)
    const send = ctx.createGain()
    send.gain.value = 0.18
    gain.connect(send)
    send.connect(this.master.reverbInput)
    this.previewGain = gain
    const start = ctx.currentTime + 0.06
    const spb = 60 / bpm
    for (const note of notes) {
      const voice = triggerNote(
        ctx,
        gain,
        instrument,
        note.pitch,
        start + note.start * spb,
        Math.max(0.05, note.duration * spb),
        note.velocity,
      )
      this.previewVoices.add(voice)
    }
    this.previewEndsAt = start + (lengthBeats + 2.4) * spb
    this.previewTimer = window.setTimeout(() => {
      this.stopPreview()
      onEnd?.()
    }, (lengthBeats + 1.2) * spb * 1000 + 120)
    void this.onPreviewEnd
  }

  stopPreview() {
    if (this.previewTimer !== null) {
      window.clearTimeout(this.previewTimer)
      this.previewTimer = null
    }
    for (const voice of this.previewVoices) voice.stop()
    this.previewVoices.clear()
    this.previewEndsAt = 0
    if (this.previewGain) {
      try {
        this.previewGain.disconnect()
      } catch {
        /* noop */
      }
      this.previewGain = null
    }
  }

  noteOnTrack(track: Track, pitch: number, velocity = 0.8) {
    return this.noteOn(track.instrument, track.id, pitch, velocity)
  }

  get contextState() {
    return this.ctx?.state ?? 'not-created'
  }
}

export const engine = new AudioEngine()
