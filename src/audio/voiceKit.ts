import type { InstrumentId } from '../types'

export type Ctx = BaseAudioContext

export interface VoiceHandle {
  id: string
  instrument: InstrumentId
  gain: GainNode
  startedAt: number
  endsAt: number
  /** Quick cut, used by the transport. */
  stop: (at?: number) => void
  /** Natural, instrument-shaped release, used when a played key is let go. */
  release?: (at?: number) => void
  setDestination?: (node: AudioNode) => void
}

export const noiseCache = new WeakMap<Ctx, AudioBuffer>()

export const NOTE_VOICE_COUNTER = { value: 0 }

export const midiToHz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12)

export const makeNoiseBuffer = (ctx: Ctx) => {
  const cached = noiseCache.get(ctx)
  if (cached) return cached
  const length = Math.floor(ctx.sampleRate * 2)
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  let last = 0
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1
    last = last * 0.22 + white * 0.78
    data[i] = last
  }
  noiseCache.set(ctx, buffer)
  return buffer
}

export const holdParam = (param: AudioParam, time: number) => {
  const candidate = param as AudioParam & { cancelAndHoldAtTime?: (time: number) => void }
  if (typeof candidate.cancelAndHoldAtTime === 'function') {
    candidate.cancelAndHoldAtTime(time)
  } else {
    param.cancelScheduledValues(time)
  }
}

export const safeStop = (source: AudioScheduledSourceNode, time: number) => {
  try {
    source.stop(Math.max(0, time))
  } catch {
    /* already stopped */
  }
}

export interface EnvelopeOptions {
  attack: number
  decay: number
  sustain: number
  release: number
  peak: number
}

export const applyEnvelope = (
  gain: GainNode,
  when: number,
  duration: number,
  opts: EnvelopeOptions,
) => {
  const t = when
  const end = t + duration
  const attack = Math.min(opts.attack, duration * 0.35)
  const decay = Math.min(opts.decay, Math.max(0.01, duration * 0.9))
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, opts.peak), t + attack)
  gain.gain.exponentialRampToValueAtTime(
    Math.max(0.0001, opts.peak * opts.sustain),
    t + attack + decay,
  )
  holdParam(gain.gain, end)
  gain.gain.exponentialRampToValueAtTime(0.0001, end + opts.release)
  return end + opts.release + 0.03
}

export const connectPanned = (ctx: Ctx, node: AudioNode, pan: number, destination: AudioNode) => {
  if (Math.abs(pan) < 0.01) {
    node.connect(destination)
    return
  }
  const panner = ctx.createStereoPanner()
  panner.pan.value = pan
  node.connect(panner)
  panner.connect(destination)
}

export const createOutput = (ctx: Ctx) => {
  const gain = ctx.createGain()
  gain.gain.value = 0
  return gain
}

export const makeVoice = (
  ctx: Ctx,
  instrument: InstrumentId,
  gain: GainNode,
  sources: AudioScheduledSourceNode[],
  endsAt: number,
  extras: AudioNode[] = [],
): VoiceHandle => {
  const start = ctx.currentTime
  let stopped = false
  const fade = (at: number, tau: number, tail: number) => {
    if (stopped) return
    stopped = true
    const releaseAt = Math.max(at, start)
    gain.gain.cancelScheduledValues(releaseAt)
    holdParam(gain.gain, releaseAt)
    gain.gain.setTargetAtTime(0.0001, releaseAt, tau)
    for (const source of sources) safeStop(source, releaseAt + tail)
    window.setTimeout(() => {
      try {
        gain.disconnect()
        for (const extra of extras) extra.disconnect()
      } catch {
        /* noop */
      }
    }, Math.max(0, (releaseAt - ctx.currentTime + tail + 0.2) * 1000))
  }
  const releaseTime = releaseTimeFor(instrument)
  return {
    id: `voice_${NOTE_VOICE_COUNTER.value++}`,
    instrument,
    gain,
    startedAt: start,
    endsAt,
    stop: (at = ctx.currentTime) => fade(at, 0.012, 0.07),
    release: (at = ctx.currentTime) => fade(at, releaseTime / 4.5, releaseTime * 1.3 + 0.05),
  }
}

/**
 * How long each instrument rings after a live key is let go. Transport stops
 * still cut every voice quickly; this only shapes a player's note-off.
 */
const RELEASE_TIMES: Partial<Record<InstrumentId, number>> = {
  piano: 0.45,
  grand: 0.32,
  electric: 0.5,
  wurlitzer: 0.3,
  harp: 0.9,
  bell: 1.1,
  celesta: 0.8,
  vibraphone: 1.2,
  musicbox: 0.9,
  kalimba: 0.5,
  steelpan: 0.6,
  organ: 0.08,
  pipe: 0.6,
  clav: 0.05,
  pad: 1.4,
  strings: 0.7,
  aurora: 1.6,
  choir: 1,
  halo: 1.8,
  velour: 1.5,
  crystal: 2,
  tapestrings: 0.55,
  cello: 0.4,
  flute: 0.22,
  ocarina: 0.18,
  brass: 0.28,
  trumpet: 0.16,
  supersaw: 0.4,
  neon: 0.3,
  chip: 0.04,
  nylon: 0.3,
  steelguitar: 0.28,
  fretless: 0.2,
  upright: 0.14,
  acid: 0.05,
  pulsebass: 0.08,
  eightoheight: 0.3,
}

export const releaseTimeFor = (instrument: InstrumentId) => RELEASE_TIMES[instrument] ?? 0.14

export const finalize = (
  out: GainNode,
  ctx: Ctx,
  _sources: AudioScheduledSourceNode[],
  endTime: number,
) => {
  window.setTimeout(
    () => {
      try {
        out.disconnect()
      } catch {
        /* noop */
      }
    },
    Math.max(0, (endTime - ctx.currentTime + 0.25) * 1000),
  )
  return { out, endTime }
}

// ── Pitched instruments ────────────────────────────────────────────────
