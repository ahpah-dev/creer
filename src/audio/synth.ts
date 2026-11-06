import type { InstrumentId } from '../types'

type Ctx = BaseAudioContext

export interface VoiceHandle {
  id: string
  instrument: InstrumentId
  gain: GainNode
  startedAt: number
  endsAt: number
  stop: (at?: number) => void
  setDestination?: (node: AudioNode) => void
}

const noiseCache = new WeakMap<Ctx, AudioBuffer>()

const NOTE_VOICE_COUNTER = { value: 0 }

const midiToHz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12)

const makeNoiseBuffer = (ctx: Ctx) => {
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

const holdParam = (param: AudioParam, time: number) => {
  const candidate = param as AudioParam & { cancelAndHoldAtTime?: (time: number) => void }
  if (typeof candidate.cancelAndHoldAtTime === 'function') {
    candidate.cancelAndHoldAtTime(time)
  } else {
    param.cancelScheduledValues(time)
  }
}

const safeStop = (source: AudioScheduledSourceNode, time: number) => {
  try {
    source.stop(Math.max(0, time))
  } catch {
    /* already stopped */
  }
}

interface EnvelopeOptions {
  attack: number
  decay: number
  sustain: number
  release: number
  peak: number
}

const applyEnvelope = (
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

const connectPanned = (ctx: Ctx, node: AudioNode, pan: number, destination: AudioNode) => {
  if (Math.abs(pan) < 0.01) {
    node.connect(destination)
    return
  }
  const panner = ctx.createStereoPanner()
  panner.pan.value = pan
  node.connect(panner)
  panner.connect(destination)
}

const createOutput = (ctx: Ctx) => {
  const gain = ctx.createGain()
  gain.gain.value = 0
  return gain
}

const makeVoice = (
  ctx: Ctx,
  instrument: InstrumentId,
  gain: GainNode,
  sources: AudioScheduledSourceNode[],
  endsAt: number,
  extras: AudioNode[] = [],
): VoiceHandle => {
  const start = ctx.currentTime
  let stopped = false
  const stop = (at = ctx.currentTime) => {
    if (stopped) return
    stopped = true
    const releaseAt = Math.max(at, start)
    gain.gain.cancelScheduledValues(releaseAt)
    holdParam(gain.gain, releaseAt)
    gain.gain.setTargetAtTime(0.0001, releaseAt, 0.012)
    for (const source of sources) safeStop(source, releaseAt + 0.07)
    window.setTimeout(() => {
      try {
        gain.disconnect()
        for (const extra of extras) extra.disconnect()
      } catch {
        /* noop */
      }
    }, Math.max(0, (releaseAt - start + 0.2) * 1000))
  }
  return {
    id: `voice_${NOTE_VOICE_COUNTER.value++}`,
    instrument,
    gain,
    startedAt: start,
    endsAt,
    stop,
  }
}

const finalize = (
  out: GainNode,
  _ctx: Ctx,
  sources: AudioScheduledSourceNode[],
  endTime: number,
) => {
  const last = sources[sources.length - 1]
  if (last) {
    last.onended = () => {
      window.setTimeout(() => {
        try {
          out.disconnect()
        } catch {
          /* noop */
        }
      }, 120)
    }
  }
  return { out, endTime }
}

// ── Pitched instruments ────────────────────────────────────────────────

const playPiano = (
  ctx: Ctx,
  destination: AudioNode,
  pitch: number,
  when: number,
  duration: number,
  velocity: number,
) => {
  const out = createOutput(ctx)
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.Q.value = 0.35
  filter.frequency.setValueAtTime(4800 + velocity * 2600, when)
  filter.frequency.exponentialRampToValueAtTime(1400, when + 1.7)
  filter.connect(out)

  const f = midiToHz(pitch)
  const sources: AudioScheduledSourceNode[] = []
  const partials = [
    { ratio: 1, type: 'sine' as OscillatorType, gain: 0.58, detune: 0 },
    { ratio: 2.003, type: 'sine' as OscillatorType, gain: 0.2, detune: 2 },
    { ratio: 3.008, type: 'sine' as OscillatorType, gain: 0.08, detune: -2 },
    { ratio: 4.98, type: 'triangle' as OscillatorType, gain: 0.028, detune: 0 },
  ]

  for (const partial of partials) {
    const osc = ctx.createOscillator()
    osc.type = partial.type
    osc.frequency.value = f * partial.ratio
    osc.detune.value = partial.detune
    const gain = ctx.createGain()
    gain.gain.value = partial.gain
    osc.connect(gain)
    gain.connect(filter)
    osc.start(when)
    osc.stop(when + duration + 0.7)
    sources.push(osc)
  }

  const hammer = ctx.createBufferSource()
  hammer.buffer = makeNoiseBuffer(ctx)
  hammer.playbackRate.value = 1.8
  const hammerFilter = ctx.createBiquadFilter()
  hammerFilter.type = 'bandpass'
  hammerFilter.frequency.value = Math.min(8500, f * 8)
  hammerFilter.Q.value = 0.7
  const hammerGain = ctx.createGain()
  hammerGain.gain.setValueAtTime(0, when)
  hammerGain.gain.linearRampToValueAtTime(0.055 * velocity, when + 0.002)
  hammerGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.06)
  hammer.connect(hammerFilter)
  hammerFilter.connect(hammerGain)
  hammerGain.connect(out)
  hammer.start(when)
  hammer.stop(when + 0.08)
  sources.push(hammer)

  const peak = 0.12 + velocity * 0.12
  const end = applyEnvelope(out, when, duration, {
    attack: 0.004,
    decay: 1.5 + (84 - pitch) * 0.012,
    sustain: 0.11,
    release: 0.45,
    peak,
  })
  out.connect(destination)
  finalize(out, ctx, sources, end)
  return makeVoice(ctx, 'piano', out, sources, end, [filter])
}

const playElectric = (
  ctx: Ctx,
  destination: AudioNode,
  pitch: number,
  when: number,
  duration: number,
  velocity: number,
) => {
  const out = createOutput(ctx)
  const tremolo = ctx.createGain()
  tremolo.gain.value = 0.9
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 4.1
  const lfoDepth = ctx.createGain()
  lfoDepth.gain.value = 0.1
  lfo.connect(lfoDepth)
  lfoDepth.connect(tremolo.gain)
  lfo.start(when)
  lfo.stop(when + duration + 1.2)
  tremolo.connect(out)

  const f = midiToHz(pitch)
  const sources: AudioScheduledSourceNode[] = [lfo]

  const carrier = ctx.createOscillator()
  carrier.type = 'sine'
  carrier.frequency.value = f

  const modulator = ctx.createOscillator()
  modulator.type = 'sine'
  modulator.frequency.value = f * 2.01

  const modDepth = ctx.createGain()
  modDepth.gain.setValueAtTime(f * (0.5 + velocity * 1.5), when)
  modDepth.gain.exponentialRampToValueAtTime(Math.max(0.01, f * 0.07), when + 0.9)
  modulator.connect(modDepth)
  modDepth.connect(carrier.frequency)

  const bodyGain = ctx.createGain()
  bodyGain.gain.value = 0.62
  carrier.connect(bodyGain)

  const tine = ctx.createOscillator()
  tine.type = 'sine'
  tine.frequency.value = f * 4.01
  const tineGain = ctx.createGain()
  tineGain.gain.setValueAtTime(0.09 * velocity, when)
  tineGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.45)
  tine.connect(tineGain)
  tineGain.connect(tremolo)

  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 3400
  filter.Q.value = 0.4
  bodyGain.connect(filter)
  filter.connect(tremolo)

  carrier.start(when)
  modulator.start(when)
  tine.start(when)
  carrier.stop(when + duration + 1)
  modulator.stop(when + duration + 1)
  tine.stop(when + duration + 1)
  sources.push(carrier, modulator, tine)

  const end = applyEnvelope(out, when, duration, {
    attack: 0.008,
    decay: 1.2,
    sustain: 0.2,
    release: 0.6,
    peak: 0.2 + velocity * 0.1,
  })
  out.connect(destination)
  finalize(out, ctx, sources, end)
  return makeVoice(ctx, 'electric', out, sources, end, [filter, tremolo])
}

const playPad = (
  ctx: Ctx,
  destination: AudioNode,
  pitch: number,
  when: number,
  duration: number,
  velocity: number,
) => {
  const out = createOutput(ctx)
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.Q.value = 0.9
  filter.frequency.setValueAtTime(420, when)
  filter.frequency.linearRampToValueAtTime(950 + velocity * 600, when + Math.min(2.4, duration))
  filter.connect(out)

  const f = midiToHz(pitch)
  const sources: AudioScheduledSourceNode[] = []
  const detunes = [-8, 0, 7]
  for (const cents of detunes) {
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = f
    osc.detune.value = cents
    const gain = ctx.createGain()
    gain.gain.value = 0.3
    osc.connect(gain)
    gain.connect(filter)
    osc.start(when)
    osc.stop(when + duration + 2.2)
    sources.push(osc)
  }
  const sub = ctx.createOscillator()
  sub.type = 'triangle'
  sub.frequency.value = f / 2
  const subGain = ctx.createGain()
  subGain.gain.value = 0.22
  sub.connect(subGain)
  subGain.connect(filter)
  sub.start(when)
  sub.stop(when + duration + 2.2)
  sources.push(sub)

  const end = applyEnvelope(out, when, duration, {
    attack: 0.55,
    decay: 0.4,
    sustain: 0.85,
    release: 1.7,
    peak: 0.085 + velocity * 0.06,
  })
  out.connect(destination)
  finalize(out, ctx, sources, end)
  return makeVoice(ctx, 'pad', out, sources, end, [filter])
}

const playBass = (
  ctx: Ctx,
  destination: AudioNode,
  pitch: number,
  when: number,
  duration: number,
  velocity: number,
) => {
  const out = createOutput(ctx)
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.Q.value = 1.2
  filter.frequency.setValueAtTime(1500 + velocity * 800, when)
  filter.frequency.exponentialRampToValueAtTime(280, when + 0.42)
  filter.connect(out)

  const f = midiToHz(pitch)
  const sources: AudioScheduledSourceNode[] = []

  const oscA = ctx.createOscillator()
  oscA.type = 'sawtooth'
  oscA.frequency.value = f
  const gainA = ctx.createGain()
  gainA.gain.value = 0.55
  oscA.connect(gainA)
  gainA.connect(filter)

  const oscB = ctx.createOscillator()
  oscB.type = 'square'
  oscB.frequency.value = f
  oscB.detune.value = -6
  const gainB = ctx.createGain()
  gainB.gain.value = 0.2
  oscB.connect(gainB)
  gainB.connect(filter)

  const sub = ctx.createOscillator()
  sub.type = 'sine'
  sub.frequency.value = f / 2
  const subGain = ctx.createGain()
  subGain.gain.value = 0.75
  sub.connect(subGain)
  subGain.connect(out)

  for (const node of [oscA, oscB, sub]) {
    node.start(when)
    node.stop(when + duration + 0.4)
    sources.push(node)
  }

  const end = applyEnvelope(out, when, duration, {
    attack: 0.012,
    decay: 0.22,
    sustain: 0.72,
    release: 0.16,
    peak: 0.22 + velocity * 0.12,
  })
  out.connect(destination)
  finalize(out, ctx, sources, end)
  return makeVoice(ctx, 'bass', out, sources, end, [filter])
}

const playPluck = (
  ctx: Ctx,
  destination: AudioNode,
  pitch: number,
  when: number,
  duration: number,
  velocity: number,
) => {
  const out = createOutput(ctx)
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.Q.value = 2.4
  filter.frequency.setValueAtTime(5400, when)
  filter.frequency.exponentialRampToValueAtTime(700, when + 0.35)
  filter.connect(out)

  const f = midiToHz(pitch)
  const sources: AudioScheduledSourceNode[] = []

  const triangle = ctx.createOscillator()
  triangle.type = 'triangle'
  triangle.frequency.value = f
  const triGain = ctx.createGain()
  triGain.gain.value = 0.62
  triangle.connect(triGain)
  triGain.connect(filter)

  const saw = ctx.createOscillator()
  saw.type = 'sawtooth'
  saw.frequency.value = f
  saw.detune.value = 5
  const sawGain = ctx.createGain()
  sawGain.gain.value = 0.2
  saw.connect(sawGain)
  sawGain.connect(filter)

  const transient = ctx.createBufferSource()
  transient.buffer = makeNoiseBuffer(ctx)
  transient.playbackRate.value = 2.2
  const transientFilter = ctx.createBiquadFilter()
  transientFilter.type = 'bandpass'
  transientFilter.frequency.value = Math.min(9000, f * 6)
  transientFilter.Q.value = 1
  const transientGain = ctx.createGain()
  transientGain.gain.setValueAtTime(0.04 * velocity, when)
  transientGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.03)
  transient.connect(transientFilter)
  transientFilter.connect(transientGain)
  transientGain.connect(out)

  for (const node of [triangle, saw, transient]) {
    node.start(when)
    node.stop(when + duration + 0.35)
    sources.push(node)
  }

  const end = applyEnvelope(out, when, duration, {
    attack: 0.004,
    decay: 0.43,
    sustain: 0.04,
    release: 0.3,
    peak: 0.15 + velocity * 0.08,
  })
  out.connect(destination)
  finalize(out, ctx, sources, end)
  return makeVoice(ctx, 'pluck', out, sources, end, [filter])
}

const playBell = (
  ctx: Ctx,
  destination: AudioNode,
  pitch: number,
  when: number,
  duration: number,
  velocity: number,
) => {
  const out = createOutput(ctx)
  const f = midiToHz(pitch)
  const sources: AudioScheduledSourceNode[] = []

  const carrier = ctx.createOscillator()
  carrier.type = 'sine'
  carrier.frequency.value = f
  const modulator = ctx.createOscillator()
  modulator.type = 'sine'
  modulator.frequency.value = f * 3.01
  const modDepth = ctx.createGain()
  modDepth.gain.setValueAtTime(f * (0.55 + velocity * 0.8), when)
  modDepth.gain.exponentialRampToValueAtTime(1, when + 2.4)
  modulator.connect(modDepth)
  modDepth.connect(carrier.frequency)

  const shimmer = ctx.createOscillator()
  shimmer.type = 'sine'
  shimmer.frequency.value = f * 2.005
  const shimmerGain = ctx.createGain()
  shimmerGain.gain.setValueAtTime(0.18, when)
  shimmerGain.gain.exponentialRampToValueAtTime(0.0001, when + 1.6)
  shimmer.connect(shimmerGain)
  shimmerGain.connect(out)

  const body = ctx.createGain()
  body.gain.value = 0.4
  carrier.connect(body)
  body.connect(out)

  for (const node of [carrier, modulator, shimmer]) {
    node.start(when)
    node.stop(when + Math.max(2.7, duration + 1.5))
    sources.push(node)
  }

  const end = applyEnvelope(out, when, duration, {
    attack: 0.004,
    decay: 2.2,
    sustain: 0.06,
    release: 1.6,
    peak: 0.12 + velocity * 0.1,
  })
  out.connect(destination)
  finalize(out, ctx, sources, end)
  return makeVoice(ctx, 'bell', out, sources, end)
}

const playStrings = (
  ctx: Ctx,
  destination: AudioNode,
  pitch: number,
  when: number,
  duration: number,
  velocity: number,
) => {
  const out = createOutput(ctx)
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 2100
  filter.Q.value = 0.5
  filter.connect(out)

  const f = midiToHz(pitch)
  const sources: AudioScheduledSourceNode[] = []
  const vibrato = ctx.createOscillator()
  vibrato.frequency.value = 4.7
  const vibratoDepth = ctx.createGain()
  vibratoDepth.gain.value = 4.5
  vibrato.connect(vibratoDepth)
  vibrato.start(when)
  vibrato.stop(when + duration + 1.3)
  sources.push(vibrato)

  for (const cents of [-9, 0, 9]) {
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = f
    osc.detune.value = cents
    vibratoDepth.connect(osc.detune)
    const gain = ctx.createGain()
    gain.gain.value = 0.22
    osc.connect(gain)
    gain.connect(filter)
    osc.start(when)
    osc.stop(when + duration + 1.2)
    sources.push(osc)
  }

  const end = applyEnvelope(out, when, duration, {
    attack: 0.32,
    decay: 0.4,
    sustain: 0.8,
    release: 0.9,
    peak: 0.1 + velocity * 0.06,
  })
  out.connect(destination)
  finalize(out, ctx, sources, end)
  return makeVoice(ctx, 'strings', out, sources, end, [filter])
}

const playOrgan = (
  ctx: Ctx,
  destination: AudioNode,
  pitch: number,
  when: number,
  duration: number,
  velocity: number,
) => {
  const out = createOutput(ctx)
  const tremolo = ctx.createGain()
  tremolo.gain.value = 0.86
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 5.2
  const depth = ctx.createGain()
  depth.gain.value = 0.1
  lfo.connect(depth)
  depth.connect(tremolo.gain)
  lfo.start(when)
  lfo.stop(when + duration + 0.6)
  tremolo.connect(out)
  const sources: AudioScheduledSourceNode[] = [lfo]
  const f = midiToHz(pitch)
  const drawbars = [
    { ratio: 1, gain: 0.5 },
    { ratio: 2, gain: 0.22 },
    { ratio: 3, gain: 0.12 },
    { ratio: 4, gain: 0.075 },
    { ratio: 6, gain: 0.035 },
  ]
  for (const bar of drawbars) {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = f * bar.ratio
    const gain = ctx.createGain()
    gain.gain.value = bar.gain
    osc.connect(gain)
    gain.connect(tremolo)
    osc.start(when)
    osc.stop(when + duration + 0.5)
    sources.push(osc)
  }
  const end = applyEnvelope(out, when, duration, {
    attack: 0.018,
    decay: 0.12,
    sustain: 0.85,
    release: 0.24,
    peak: 0.14 + velocity * 0.08,
  })
  out.connect(destination)
  finalize(out, ctx, sources, end)
  return makeVoice(ctx, 'organ', out, sources, end, [tremolo])
}

const playMarimba = (
  ctx: Ctx,
  destination: AudioNode,
  pitch: number,
  when: number,
  duration: number,
  velocity: number,
) => {
  const out = createOutput(ctx)
  const f = midiToHz(pitch)
  const sources: AudioScheduledSourceNode[] = []

  const fundamental = ctx.createOscillator()
  fundamental.type = 'sine'
  fundamental.frequency.value = f
  const fundamentalGain = ctx.createGain()
  fundamentalGain.gain.value = 0.8
  fundamental.connect(fundamentalGain)
  fundamentalGain.connect(out)

  const harmonic = ctx.createOscillator()
  harmonic.type = 'sine'
  harmonic.frequency.value = f * 3.98
  const harmonicGain = ctx.createGain()
  harmonicGain.gain.setValueAtTime(0.18, when)
  harmonicGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.18)
  harmonic.connect(harmonicGain)
  harmonicGain.connect(out)

  const mallet = ctx.createBufferSource()
  mallet.buffer = makeNoiseBuffer(ctx)
  mallet.playbackRate.value = 3
  const malletFilter = ctx.createBiquadFilter()
  malletFilter.type = 'bandpass'
  malletFilter.frequency.value = Math.min(10000, f * 9)
  malletFilter.Q.value = 1.2
  const malletGain = ctx.createGain()
  malletGain.gain.setValueAtTime(0.04 * velocity, when)
  malletGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.03)
  mallet.connect(malletFilter)
  malletFilter.connect(malletGain)
  malletGain.connect(out)

  for (const node of [fundamental, harmonic, mallet]) {
    node.start(when)
    node.stop(when + Math.max(0.5, duration + 0.4))
    sources.push(node)
  }

  const end = applyEnvelope(out, when, duration, {
    attack: 0.002,
    decay: 0.5,
    sustain: 0.02,
    release: 0.3,
    peak: 0.2 + velocity * 0.1,
  })
  out.connect(destination)
  finalize(out, ctx, sources, end)
  return makeVoice(ctx, 'marimba', out, sources, end)
}

const playHarp = (
  ctx: Ctx,
  destination: AudioNode,
  pitch: number,
  when: number,
  duration: number,
  velocity: number,
) => {
  const out = createOutput(ctx)
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 6800
  filter.Q.value = 0.35
  filter.connect(out)
  const f = midiToHz(pitch)
  const sources: AudioScheduledSourceNode[] = []
  const partials = [
    { ratio: 1, gain: 0.42, type: 'sine' as OscillatorType },
    { ratio: 2.002, gain: 0.18, type: 'sine' as OscillatorType },
    { ratio: 3.009, gain: 0.09, type: 'sine' as OscillatorType },
    { ratio: 4.97, gain: 0.045, type: 'triangle' as OscillatorType },
    { ratio: 6.08, gain: 0.022, type: 'sine' as OscillatorType },
  ]
  for (const partial of partials) {
    const osc = ctx.createOscillator()
    osc.type = partial.type
    osc.frequency.value = f * partial.ratio
    const gain = ctx.createGain()
    gain.gain.value = partial.gain
    osc.connect(gain)
    gain.connect(filter)
    osc.start(when)
    osc.stop(when + duration + 1.1)
    sources.push(osc)
  }
  const pluck = ctx.createBufferSource()
  pluck.buffer = makeNoiseBuffer(ctx)
  pluck.playbackRate.value = 2.1
  const pluckFilter = ctx.createBiquadFilter()
  pluckFilter.type = 'bandpass'
  pluckFilter.frequency.value = Math.min(9500, f * 7)
  pluckFilter.Q.value = 0.8
  const pluckGain = ctx.createGain()
  pluckGain.gain.setValueAtTime(0.035 * velocity, when)
  pluckGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.035)
  pluck.connect(pluckFilter)
  pluckFilter.connect(pluckGain)
  pluckGain.connect(out)
  pluck.start(when)
  pluck.stop(when + 0.05)
  sources.push(pluck)

  const end = applyEnvelope(out, when, duration, {
    attack: 0.003,
    decay: 2.1,
    sustain: 0.04,
    release: 0.65,
    peak: 0.13 + velocity * 0.1,
  })
  out.connect(destination)
  finalize(out, ctx, sources, end)
  return makeVoice(ctx, 'harp', out, sources, end, [filter])
}

const playWurlitzer = (
  ctx: Ctx,
  destination: AudioNode,
  pitch: number,
  when: number,
  duration: number,
  velocity: number,
) => {
  const out = createOutput(ctx)
  const tremolo = ctx.createGain()
  tremolo.gain.value = 0.88
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 5.6
  const lfoDepth = ctx.createGain()
  lfoDepth.gain.value = 0.12
  lfo.connect(lfoDepth)
  lfoDepth.connect(tremolo.gain)
  lfo.start(when)
  lfo.stop(when + duration + 1)
  tremolo.connect(out)

  const f = midiToHz(pitch)
  const sources: AudioScheduledSourceNode[] = [lfo]
  const carrier = ctx.createOscillator()
  carrier.type = 'sine'
  carrier.frequency.value = f
  const modulator = ctx.createOscillator()
  modulator.type = 'sine'
  modulator.frequency.value = f * 3.01
  const modDepth = ctx.createGain()
  modDepth.gain.setValueAtTime(f * (0.7 + velocity * 2.1), when)
  modDepth.gain.exponentialRampToValueAtTime(Math.max(0.01, f * 0.04), when + 0.38)
  modulator.connect(modDepth)
  modDepth.connect(carrier.frequency)

  const body = ctx.createGain()
  body.gain.value = 0.56
  carrier.connect(body)
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 2900
  filter.Q.value = 0.6
  body.connect(filter)
  filter.connect(tremolo)

  const tine = ctx.createOscillator()
  tine.type = 'sine'
  tine.frequency.value = f * 2.01
  const tineGain = ctx.createGain()
  tineGain.gain.setValueAtTime(0.08 * velocity, when)
  tineGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.32)
  tine.connect(tineGain)
  tineGain.connect(tremolo)

  for (const node of [carrier, modulator, tine]) {
    node.start(when)
    node.stop(when + duration + 0.8)
    sources.push(node)
  }

  const end = applyEnvelope(out, when, duration, {
    attack: 0.004,
    decay: 0.9,
    sustain: 0.22,
    release: 0.35,
    peak: 0.17 + velocity * 0.1,
  })
  out.connect(destination)
  finalize(out, ctx, sources, end)
  return makeVoice(ctx, 'wurlitzer', out, sources, end, [filter, tremolo])
}

const playToy = (
  ctx: Ctx,
  destination: AudioNode,
  pitch: number,
  when: number,
  duration: number,
  velocity: number,
) => {
  const out = createOutput(ctx)
  const f = midiToHz(pitch)
  const sources: AudioScheduledSourceNode[] = []
  const partials = [
    { ratio: 1, gain: 0.46, type: 'sine' as OscillatorType },
    { ratio: 3.99, gain: 0.2, type: 'sine' as OscillatorType },
    { ratio: 7.08, gain: 0.07, type: 'sine' as OscillatorType },
  ]
  for (const partial of partials) {
    const osc = ctx.createOscillator()
    osc.type = partial.type
    osc.frequency.value = f * partial.ratio
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(partial.gain, when)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + (partial.ratio > 3 ? 0.2 : 0.55))
    osc.connect(gain)
    gain.connect(out)
    osc.start(when)
    osc.stop(when + 0.62)
    sources.push(osc)
  }
  const tine = ctx.createOscillator()
  tine.type = 'triangle'
  tine.frequency.value = f * 2.01
  const tineGain = ctx.createGain()
  tineGain.gain.setValueAtTime(0.05 * velocity, when)
  tineGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.14)
  tine.connect(tineGain)
  tineGain.connect(out)
  tine.start(when)
  tine.stop(when + 0.18)
  sources.push(tine)

  const end = applyEnvelope(out, when, duration, {
    attack: 0.0015,
    decay: 0.5,
    sustain: 0.01,
    release: 0.16,
    peak: 0.16 + velocity * 0.08,
  })
  out.connect(destination)
  finalize(out, ctx, sources, end)
  return makeVoice(ctx, 'toy', out, sources, end)
}

const playMusicBox = (
  ctx: Ctx,
  destination: AudioNode,
  pitch: number,
  when: number,
  duration: number,
  velocity: number,
) => {
  const out = createOutput(ctx)
  const f = midiToHz(pitch)
  const sources: AudioScheduledSourceNode[] = []
  const carrier = ctx.createOscillator()
  carrier.type = 'sine'
  carrier.frequency.value = f
  const modulator = ctx.createOscillator()
  modulator.type = 'sine'
  modulator.frequency.value = f * 4.02
  const modDepth = ctx.createGain()
  modDepth.gain.setValueAtTime(f * 0.5, when)
  modDepth.gain.exponentialRampToValueAtTime(1, when + 1.6)
  modulator.connect(modDepth)
  modDepth.connect(carrier.frequency)
  const body = ctx.createGain()
  body.gain.value = 0.36
  carrier.connect(body)
  body.connect(out)

  const sparkle = ctx.createOscillator()
  sparkle.type = 'sine'
  sparkle.frequency.value = f * 2.99
  const sparkleGain = ctx.createGain()
  sparkleGain.gain.setValueAtTime(0.11 * velocity, when)
  sparkleGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.8)
  sparkle.connect(sparkleGain)
  sparkleGain.connect(out)

  for (const node of [carrier, modulator, sparkle]) {
    node.start(when)
    node.stop(when + Math.max(2.2, duration + 1.2))
    sources.push(node)
  }
  const end = applyEnvelope(out, when, duration, {
    attack: 0.002,
    decay: 1.8,
    sustain: 0.02,
    release: 1.35,
    peak: 0.1 + velocity * 0.06,
  })
  out.connect(destination)
  finalize(out, ctx, sources, end)
  return makeVoice(ctx, 'musicbox', out, sources, end)
}

const playSub = (
  ctx: Ctx,
  destination: AudioNode,
  pitch: number,
  when: number,
  duration: number,
  velocity: number,
) => {
  const out = createOutput(ctx)
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 260
  filter.Q.value = 0.45
  filter.connect(out)
  const f = midiToHz(pitch)
  const sources: AudioScheduledSourceNode[] = []
  const fundamental = ctx.createOscillator()
  fundamental.type = 'sine'
  fundamental.frequency.value = f
  const fundamentalGain = ctx.createGain()
  fundamentalGain.gain.value = 0.54
  fundamental.connect(fundamentalGain)
  fundamentalGain.connect(filter)
  const sub = ctx.createOscillator()
  sub.type = 'sine'
  sub.frequency.value = f / 2
  const subGain = ctx.createGain()
  subGain.gain.value = 0.72
  sub.connect(subGain)
  subGain.connect(out)
  const body = ctx.createOscillator()
  body.type = 'triangle'
  body.frequency.value = f
  const bodyGain = ctx.createGain()
  bodyGain.gain.value = 0.07
  body.connect(bodyGain)
  bodyGain.connect(filter)
  for (const node of [fundamental, sub, body]) {
    node.start(when)
    node.stop(when + duration + 0.5)
    sources.push(node)
  }
  const end = applyEnvelope(out, when, duration, {
    attack: 0.025,
    decay: 0.2,
    sustain: 0.82,
    release: 0.24,
    peak: 0.22 + velocity * 0.12,
  })
  out.connect(destination)
  finalize(out, ctx, sources, end)
  return makeVoice(ctx, 'sub', out, sources, end, [filter])
}

const playFretless = (
  ctx: Ctx,
  destination: AudioNode,
  pitch: number,
  when: number,
  duration: number,
  velocity: number,
) => {
  const out = createOutput(ctx)
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 1100
  filter.Q.value = 1.3
  filter.connect(out)
  const f = midiToHz(pitch)
  const sources: AudioScheduledSourceNode[] = []
  const vibrato = ctx.createOscillator()
  vibrato.frequency.value = 4.7
  const vibratoDepth = ctx.createGain()
  vibratoDepth.gain.value = 6
  vibrato.connect(vibratoDepth)
  vibrato.start(when)
  vibrato.stop(when + duration + 0.9)
  sources.push(vibrato)

  const triangle = ctx.createOscillator()
  triangle.type = 'triangle'
  triangle.frequency.setValueAtTime(f * 0.965, when)
  triangle.frequency.exponentialRampToValueAtTime(f, when + 0.11)
  const triGain = ctx.createGain()
  triGain.gain.value = 0.6
  triangle.connect(triGain)
  triGain.connect(filter)
  vibratoDepth.connect(triangle.detune)
  const saw = ctx.createOscillator()
  saw.type = 'sawtooth'
  saw.frequency.setValueAtTime(f * 0.965, when)
  saw.frequency.exponentialRampToValueAtTime(f, when + 0.11)
  saw.detune.value = 4
  const sawGain = ctx.createGain()
  sawGain.gain.value = 0.16
  saw.connect(sawGain)
  sawGain.connect(filter)
  vibratoDepth.connect(saw.detune)
  const sub = ctx.createOscillator()
  sub.type = 'sine'
  sub.frequency.value = f / 2
  const subGain = ctx.createGain()
  subGain.gain.value = 0.22
  sub.connect(subGain)
  subGain.connect(out)
  for (const node of [triangle, saw, sub]) {
    node.start(when)
    node.stop(when + duration + 0.55)
    sources.push(node)
  }
  const end = applyEnvelope(out, when, duration, {
    attack: 0.05,
    decay: 0.4,
    sustain: 0.78,
    release: 0.34,
    peak: 0.2 + velocity * 0.1,
  })
  out.connect(destination)
  finalize(out, ctx, sources, end)
  return makeVoice(ctx, 'fretless', out, sources, end, [filter])
}

const playAurora = (
  ctx: Ctx,
  destination: AudioNode,
  pitch: number,
  when: number,
  duration: number,
  velocity: number,
) => {
  const out = createOutput(ctx)
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.Q.value = 0.5
  filter.frequency.setValueAtTime(400, when)
  filter.frequency.linearRampToValueAtTime(2100, when + Math.min(3.2, duration))
  filter.connect(out)
  const f = midiToHz(pitch)
  const sources: AudioScheduledSourceNode[] = []
  const partials = [
    { ratio: 1, gain: 0.2, type: 'sine' as OscillatorType },
    { ratio: 1.005, gain: 0.16, type: 'sine' as OscillatorType },
    { ratio: 2.003, gain: 0.07, type: 'triangle' as OscillatorType },
    { ratio: 0.5, gain: 0.12, type: 'sine' as OscillatorType },
  ]
  for (const partial of partials) {
    const osc = ctx.createOscillator()
    osc.type = partial.type
    osc.frequency.value = f * partial.ratio
    osc.detune.value = partial.ratio === 1.005 ? 4 : 0
    const gain = ctx.createGain()
    gain.gain.value = partial.gain
    osc.connect(gain)
    gain.connect(filter)
    osc.start(when)
    osc.stop(when + duration + 2.7)
    sources.push(osc)
  }
  const end = applyEnvelope(out, when, duration, {
    attack: 1.0,
    decay: 0.6,
    sustain: 0.82,
    release: 2.3,
    peak: 0.065 + velocity * 0.04,
  })
  out.connect(destination)
  finalize(out, ctx, sources, end)
  return makeVoice(ctx, 'aurora', out, sources, end, [filter])
}

const playChoir = (
  ctx: Ctx,
  destination: AudioNode,
  pitch: number,
  when: number,
  duration: number,
  velocity: number,
) => {
  const out = createOutput(ctx)
  const formantOne = ctx.createBiquadFilter()
  formantOne.type = 'bandpass'
  formantOne.frequency.value = 720
  formantOne.Q.value = 1.5
  const formantTwo = ctx.createBiquadFilter()
  formantTwo.type = 'bandpass'
  formantTwo.frequency.value = 1260
  formantTwo.Q.value = 2.1
  const f1Gain = ctx.createGain()
  f1Gain.gain.value = 0.75
  const f2Gain = ctx.createGain()
  f2Gain.gain.value = 0.38
  formantOne.connect(f1Gain)
  f1Gain.connect(out)
  formantTwo.connect(f2Gain)
  f2Gain.connect(out)
  const f = midiToHz(pitch)
  const sources: AudioScheduledSourceNode[] = []
  const vibrato = ctx.createOscillator()
  vibrato.frequency.value = 4.9
  const vibratoDepth = ctx.createGain()
  vibratoDepth.gain.value = 4.2
  vibrato.connect(vibratoDepth)
  vibrato.start(when)
  vibrato.stop(when + duration + 2)
  sources.push(vibrato)
  for (const cents of [-7, 7]) {
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = f
    osc.detune.value = cents
    vibratoDepth.connect(osc.detune)
    osc.connect(formantOne)
    osc.connect(formantTwo)
    osc.start(when)
    osc.stop(when + duration + 1.9)
    sources.push(osc)
  }
  const breath = ctx.createOscillator()
  breath.type = 'triangle'
  breath.frequency.value = f
  breath.connect(formantOne)
  breath.connect(formantTwo)
  breath.start(when)
  breath.stop(when + duration + 1.9)
  sources.push(breath)

  const end = applyEnvelope(out, when, duration, {
    attack: 0.55,
    decay: 0.4,
    sustain: 0.82,
    release: 1.7,
    peak: 0.13 + velocity * 0.06,
  })
  out.connect(destination)
  finalize(out, ctx, sources, end)
  return makeVoice(ctx, 'choir', out, sources, end, [formantOne, formantTwo, f1Gain, f2Gain])
}

const playNeon = (
  ctx: Ctx,
  destination: AudioNode,
  pitch: number,
  when: number,
  duration: number,
  velocity: number,
) => {
  const out = createOutput(ctx)
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.Q.value = 1.9
  filter.frequency.setValueAtTime(950, when)
  filter.frequency.exponentialRampToValueAtTime(3800, when + 0.11)
  filter.frequency.exponentialRampToValueAtTime(1700, when + 0.5)
  filter.connect(out)
  const f = midiToHz(pitch)
  const sources: AudioScheduledSourceNode[] = []
  for (const cents of [-6, 6]) {
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = f
    osc.detune.value = cents
    const gain = ctx.createGain()
    gain.gain.value = 0.28
    osc.connect(gain)
    gain.connect(filter)
    osc.start(when)
    osc.stop(when + duration + 0.5)
    sources.push(osc)
  }
  const sub = ctx.createOscillator()
  sub.type = 'square'
  sub.frequency.value = f / 2
  const subGain = ctx.createGain()
  subGain.gain.value = 0.06
  sub.connect(subGain)
  subGain.connect(filter)
  sub.start(when)
  sub.stop(when + duration + 0.5)
  sources.push(sub)
  const end = applyEnvelope(out, when, duration, {
    attack: 0.012,
    decay: 0.2,
    sustain: 0.66,
    release: 0.22,
    peak: 0.12 + velocity * 0.06,
  })
  out.connect(destination)
  finalize(out, ctx, sources, end)
  return makeVoice(ctx, 'neon', out, sources, end, [filter])
}

const playKalimba = (
  ctx: Ctx,
  destination: AudioNode,
  pitch: number,
  when: number,
  duration: number,
  velocity: number,
) => {
  const out = createOutput(ctx)
  const f = midiToHz(pitch)
  const sources: AudioScheduledSourceNode[] = []
  const fundamental = ctx.createOscillator()
  fundamental.type = 'sine'
  fundamental.frequency.value = f
  const fundamentalGain = ctx.createGain()
  fundamentalGain.gain.value = 0.68
  fundamental.connect(fundamentalGain)
  fundamentalGain.connect(out)
  const tine = ctx.createOscillator()
  tine.type = 'sine'
  tine.frequency.value = f * 5.4
  const tineGain = ctx.createGain()
  tineGain.gain.setValueAtTime(0.14, when)
  tineGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.18)
  tine.connect(tineGain)
  tineGain.connect(out)
  const body = ctx.createOscillator()
  body.type = 'triangle'
  body.frequency.value = f * 2.01
  const bodyGain = ctx.createGain()
  bodyGain.gain.setValueAtTime(0.07, when)
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.4)
  body.connect(bodyGain)
  bodyGain.connect(out)
  for (const node of [fundamental, tine, body]) {
    node.start(when)
    node.stop(when + Math.max(0.55, duration + 0.3))
    sources.push(node)
  }
  const end = applyEnvelope(out, when, duration, {
    attack: 0.002,
    decay: 0.5,
    sustain: 0.012,
    release: 0.28,
    peak: 0.17 + velocity * 0.09,
  })
  out.connect(destination)
  finalize(out, ctx, sources, end)
  return makeVoice(ctx, 'kalimba', out, sources, end)
}

// ── Drums ──────────────────────────────────────────────────────────────

const playDrum = (
  ctx: Ctx,
  destination: AudioNode,
  pitch: number,
  when: number,
  velocity: number,
  style: 'studio' | 'lofi' = 'studio',
) => {
  const out = createOutput(ctx)
  const pan = pitch === 42 || pitch === 46 ? 0.22 : pitch === 41 ? -0.25 : pitch === 43 ? 0.15 : 0
  const lofi = style === 'lofi'
  const toneFilter = lofi ? ctx.createBiquadFilter() : null
  const saturator = lofi ? ctx.createWaveShaper() : null
  if (toneFilter && saturator) {
    toneFilter.type = 'lowpass'
    toneFilter.frequency.value = 3900
    toneFilter.Q.value = 0.6
    saturator.curve = makeSoftClipCurve(1.35)
    saturator.oversample = '2x'
    out.connect(toneFilter)
    toneFilter.connect(saturator)
    connectPanned(ctx, saturator, pan, destination)
  } else {
    connectPanned(ctx, out, pan, destination)
  }
  const sources: AudioScheduledSourceNode[] = []
  let end = when + 0.5
  const level = (0.55 + velocity * 0.55) * (lofi ? 0.9 : 1)

  const noiseBurst = (
    duration: number,
    ftype: BiquadFilterType,
    freq: number,
    q: number,
    peak: number,
    rate = 1,
  ) => {
    const noise = ctx.createBufferSource()
    noise.buffer = makeNoiseBuffer(ctx)
    noise.playbackRate.value = rate
    const filter = ctx.createBiquadFilter()
    filter.type = ftype
    filter.frequency.value = freq
    filter.Q.value = q
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(Math.max(0.0001, peak), when)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration)
    noise.connect(filter)
    filter.connect(gain)
    gain.connect(out)
    noise.start(when)
    noise.stop(when + duration + 0.02)
    sources.push(noise)
    end = Math.max(end, when + duration)
  }

  if (pitch === 36) {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(165, when)
    osc.frequency.exponentialRampToValueAtTime(46, when + 0.16)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, when)
    gain.gain.linearRampToValueAtTime(0.75 * level, when + 0.004)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.46)
    osc.connect(gain)
    gain.connect(out)
    osc.start(when)
    osc.stop(when + 0.48)
    sources.push(osc)
    noiseBurst(0.025, 'highpass', 1400, 0.7, 0.06 * level, 1.5)
    end = when + 0.5
  } else if (pitch === 38) {
    noiseBurst(0.22, 'bandpass', 1750, 0.8, 0.34 * level, 1.1)
    noiseBurst(0.12, 'highpass', 4200, 0.7, 0.15 * level, 1)
    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(190, when)
    osc.frequency.exponentialRampToValueAtTime(120, when + 0.12)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.3 * level, when)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.11)
    osc.connect(gain)
    gain.connect(out)
    osc.start(when)
    osc.stop(when + 0.13)
    sources.push(osc)
    end = when + 0.26
  } else if (pitch === 39) {
    for (let i = 0; i < 3; i++) {
      const clapNoise = ctx.createBufferSource()
      clapNoise.buffer = makeNoiseBuffer(ctx)
      const filter = ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.value = 1450
      filter.Q.value = 0.9
      const gain = ctx.createGain()
      const t = when + i * 0.011
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.linearRampToValueAtTime(0.22 * level, t + 0.003)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1)
      clapNoise.connect(filter)
      filter.connect(gain)
      gain.connect(out)
      clapNoise.start(t)
      clapNoise.stop(t + 0.12)
      sources.push(clapNoise)
    }
    end = when + 0.25
  } else if (pitch === 42 || pitch === 46) {
    noiseBurst(pitch === 46 ? 0.38 : 0.045, 'highpass', 7600, 0.7, 0.2 * level, 1.2)
    noiseBurst(pitch === 46 ? 0.3 : 0.035, 'bandpass', 10500, 1.3, 0.12 * level, 1.8)
    end = when + (pitch === 46 ? 0.4 : 0.07)
  } else if (pitch === 37) {
    noiseBurst(0.035, 'bandpass', 2300, 3, 0.26 * level, 1)
    const osc = ctx.createOscillator()
    osc.type = 'square'
    osc.frequency.value = 1650
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.04 * level, when)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.03)
    osc.connect(gain)
    gain.connect(out)
    osc.start(when)
    osc.stop(when + 0.04)
    sources.push(osc)
    end = when + 0.1
  } else if (pitch === 41 || pitch === 43 || pitch === 45) {
    const base = pitch === 41 ? 140 : pitch === 43 ? 260 : 190
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(base, when)
    osc.frequency.exponentialRampToValueAtTime(base * 0.56, when + 0.24)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.4 * level, when)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.34)
    osc.connect(gain)
    gain.connect(out)
    osc.start(when)
    osc.stop(when + 0.36)
    sources.push(osc)
    noiseBurst(0.08, 'lowpass', 800, 0.8, 0.08 * level)
    end = when + 0.38
  } else if (pitch === 49) {
    noiseBurst(1.35, 'highpass', 5200, 0.6, 0.24 * level, 1)
    noiseBurst(1.1, 'bandpass', 9000, 0.5, 0.11 * level, 1.4)
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = 620
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.025 * level, when)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.7)
    osc.connect(gain)
    gain.connect(out)
    osc.start(when)
    osc.stop(when + 0.8)
    sources.push(osc)
    end = when + 1.4
  } else if (pitch === 51) {
    noiseBurst(0.7, 'highpass', 7800, 0.6, 0.13 * level, 1.3)
    noiseBurst(0.55, 'bandpass', 4200, 1, 0.07 * level, 1.7)
    end = when + 0.75
  } else if (pitch === 56) {
    for (const freq of [540, 800]) {
      const osc = ctx.createOscillator()
      osc.type = 'square'
      osc.frequency.value = freq
      const filter = ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.value = 1100
      filter.Q.value = 1
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.06 * level, when)
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.35)
      osc.connect(filter)
      filter.connect(gain)
      gain.connect(out)
      osc.start(when)
      osc.stop(when + 0.37)
      sources.push(osc)
    }
    end = when + 0.4
  } else {
    noiseBurst(0.08, 'highpass', 3000, 0.7, 0.08 * level)
    end = when + 0.1
  }

  out.gain.setValueAtTime(0.92, when)
  finalize(out, ctx, sources, end)
  return makeVoice(
    ctx,
    lofi ? 'lofi' : 'drums',
    out,
    sources,
    end,
    toneFilter && saturator ? [toneFilter, saturator] : [],
  )
}

const playHandDrum = (
  ctx: Ctx,
  destination: AudioNode,
  pitch: number,
  when: number,
  velocity: number,
) => {
  const out = createOutput(ctx)
  const pan = pitch === 42 || pitch === 46 || pitch === 49 ? 0.25 : pitch === 41 || pitch === 45 ? -0.2 : 0
  connectPanned(ctx, out, pan, destination)
  const sources: AudioScheduledSourceNode[] = []
  const level = 0.55 + velocity * 0.5
  let end = when + 0.4

  const noiseBurst = (
    duration: number,
    type: BiquadFilterType,
    frequency: number,
    q: number,
    peak: number,
    rate = 1,
  ) => {
    const noise = ctx.createBufferSource()
    noise.buffer = makeNoiseBuffer(ctx)
    noise.playbackRate.value = rate
    const filter = ctx.createBiquadFilter()
    filter.type = type
    filter.frequency.value = frequency
    filter.Q.value = q
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(Math.max(0.0001, peak), when)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration)
    noise.connect(filter)
    filter.connect(gain)
    gain.connect(out)
    noise.start(when)
    noise.stop(when + duration + 0.02)
    sources.push(noise)
    end = Math.max(end, when + duration)
  }

  const skinHit = (base: number, drop: number, decay: number, peak: number) => {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(base, when)
    osc.frequency.exponentialRampToValueAtTime(base * drop, when + decay * 0.7)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, when)
    gain.gain.linearRampToValueAtTime(peak * level, when + 0.004)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + decay)
    osc.connect(gain)
    gain.connect(out)
    osc.start(when)
    osc.stop(when + decay + 0.02)
    sources.push(osc)
    end = Math.max(end, when + decay)
  }

  if (pitch === 36 || pitch === 41 || pitch === 43 || pitch === 45) {
    const base = pitch === 36 ? 185 : pitch === 41 ? 260 : pitch === 43 ? 420 : 310
    skinHit(base, 0.66, pitch === 36 ? 0.42 : 0.26, pitch === 36 ? 0.58 : 0.45)
    noiseBurst(0.05, 'lowpass', base * 2.4, 0.8, 0.06 * level)
  } else if (pitch === 38 || pitch === 39) {
    if (pitch === 39) {
      for (let i = 0; i < 3; i++) {
        const noise = ctx.createBufferSource()
        noise.buffer = makeNoiseBuffer(ctx)
        const filter = ctx.createBiquadFilter()
        filter.type = 'bandpass'
        filter.frequency.value = 1550
        filter.Q.value = 1
        const gain = ctx.createGain()
        const t = when + i * 0.013
        gain.gain.setValueAtTime(0.0001, t)
        gain.gain.linearRampToValueAtTime(0.18 * level, t + 0.003)
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09)
        noise.connect(filter)
        filter.connect(gain)
        gain.connect(out)
        noise.start(t)
        noise.stop(t + 0.1)
        sources.push(noise)
      }
      end = when + 0.22
    } else {
      skinHit(330, 0.7, 0.22, 0.35)
      noiseBurst(0.15, 'bandpass', 2100, 0.9, 0.2 * level)
    }
  } else if (pitch === 42 || pitch === 46) {
    noiseBurst(pitch === 46 ? 0.28 : 0.07, 'highpass', 6200, 0.7, 0.16 * level, 1.1)
    noiseBurst(pitch === 46 ? 0.2 : 0.05, 'bandpass', 9200, 1.5, 0.1 * level, 1.4)
  } else if (pitch === 37) {
    noiseBurst(0.04, 'bandpass', 2400, 3.5, 0.22 * level)
    noiseBurst(0.025, 'highpass', 5000, 0.8, 0.08 * level)
  } else if (pitch === 49) {
    noiseBurst(0.8, 'highpass', 8600, 0.7, 0.11 * level, 1.6)
    noiseBurst(0.5, 'bandpass', 11500, 1, 0.08 * level, 1.9)
  } else if (pitch === 51) {
    noiseBurst(0.45, 'highpass', 7000, 0.6, 0.07 * level, 1.2)
  } else if (pitch === 56) {
    const osc = ctx.createOscillator()
    osc.type = 'square'
    osc.frequency.value = 780
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 1100
    filter.Q.value = 2
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.06 * level, when)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.18)
    osc.connect(filter)
    filter.connect(gain)
    gain.connect(out)
    osc.start(when)
    osc.stop(when + 0.2)
    sources.push(osc)
    end = when + 0.2
  } else {
    noiseBurst(0.09, 'bandpass', 1800, 1.6, 0.1 * level)
  }

  out.gain.setValueAtTime(0.9, when)
  finalize(out, ctx, sources, end)
  return makeVoice(ctx, 'hand', out, sources, end)
}

export const triggerNote = (
  ctx: Ctx,
  destination: AudioNode,
  instrument: InstrumentId,
  pitch: number,
  when: number,
  duration: number,
  velocity: number,
): VoiceHandle => {
  const safeVelocity = Math.min(1, Math.max(0.05, velocity))
  if (instrument === 'drums' || instrument === 'lofi') {
    return playDrum(
      ctx,
      destination,
      pitch,
      when,
      safeVelocity,
      instrument === 'lofi' ? 'lofi' : 'studio',
    )
  }
  if (instrument === 'hand') {
    return playHandDrum(ctx, destination, pitch, when, safeVelocity)
  }
  switch (instrument) {
    case 'piano':
      return playPiano(ctx, destination, pitch, when, duration, safeVelocity)
    case 'electric':
      return playElectric(ctx, destination, pitch, when, duration, safeVelocity)
    case 'harp':
      return playHarp(ctx, destination, pitch, when, duration, safeVelocity)
    case 'wurlitzer':
      return playWurlitzer(ctx, destination, pitch, when, duration, safeVelocity)
    case 'toy':
      return playToy(ctx, destination, pitch, when, duration, safeVelocity)
    case 'musicbox':
      return playMusicBox(ctx, destination, pitch, when, duration, safeVelocity)
    case 'sub':
      return playSub(ctx, destination, pitch, when, duration, safeVelocity)
    case 'fretless':
      return playFretless(ctx, destination, pitch, when, duration, safeVelocity)
    case 'aurora':
      return playAurora(ctx, destination, pitch, when, duration, safeVelocity)
    case 'choir':
      return playChoir(ctx, destination, pitch, when, duration, safeVelocity)
    case 'neon':
      return playNeon(ctx, destination, pitch, when, duration, safeVelocity)
    case 'kalimba':
      return playKalimba(ctx, destination, pitch, when, duration, safeVelocity)
    case 'pad':
      return playPad(ctx, destination, pitch, when, duration, safeVelocity)
    case 'bass':
      return playBass(ctx, destination, pitch, when, duration, safeVelocity)
    case 'pluck':
      return playPluck(ctx, destination, pitch, when, duration, safeVelocity)
    case 'bell':
      return playBell(ctx, destination, pitch, when, duration, safeVelocity)
    case 'strings':
      return playStrings(ctx, destination, pitch, when, duration, safeVelocity)
    case 'organ':
      return playOrgan(ctx, destination, pitch, when, duration, safeVelocity)
    case 'marimba':
      return playMarimba(ctx, destination, pitch, when, duration, safeVelocity)
    default:
      return playPiano(ctx, destination, pitch, when, duration, safeVelocity)
  }
}

export const createReverbImpulse = (ctx: BaseAudioContext, seconds = 2.8) => {
  const length = Math.floor(ctx.sampleRate * seconds)
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel)
    for (let i = 0; i < length; i++) {
      const t = i / length
      const decay = Math.pow(1 - t, 2.4)
      const early = i < ctx.sampleRate * 0.04 ? 0.6 : 1
      data[i] = (Math.random() * 2 - 1) * decay * early
    }
  }
  return impulse
}

export const makeSoftClipCurve = (amount = 1.2) => {
  const samples = 4096
  const curve = new Float32Array(samples)
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount)
  }
  return curve
}
