/**
 * Creer's second-generation instruments.
 *
 * These voices lean on three techniques the original set used sparingly:
 *  - band-limited harmonic wavetables (PeriodicWave) for rich, alias-free tones,
 *  - per-partial envelopes with inharmonic stretching for struck and plucked
 *    strings, so the top end dies away before the body like a real string,
 *  - metallic oscillator clusters for cymbals and hats instead of plain noise.
 */
import type { InstrumentId } from '../types'
import {
  applyEnvelope,
  createOutput,
  finalize,
  holdParam,
  makeNoiseBuffer,
  makeVoice,
  midiToHz,
  type Ctx,
  type VoiceHandle,
} from './voiceKit'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

// ── Building blocks ────────────────────────────────────────────────────

const waveCache = new WeakMap<Ctx, Map<string, PeriodicWave>>()

/** A cached, band-limited wavetable from a list of harmonic amplitudes. */
const harmonicWave = (ctx: Ctx, key: string, amps: number[]) => {
  let store = waveCache.get(ctx)
  if (!store) {
    store = new Map()
    waveCache.set(ctx, store)
  }
  const cached = store.get(key)
  if (cached) return cached
  const real = new Float32Array(amps.length + 1)
  const imag = new Float32Array(amps.length + 1)
  amps.forEach((amp, index) => {
    imag[index + 1] = amp
  })
  const wave = ctx.createPeriodicWave(real, imag)
  store.set(key, wave)
  return wave
}

const pulseAmps = (duty: number, count = 48) =>
  Array.from({ length: count }, (_, i) => {
    const n = i + 1
    return Math.sin(Math.PI * n * duty) / n
  })

const curveCache = new Map<string, Float32Array>()
const driveCurve = (amount: number) => {
  const key = amount.toFixed(2)
  const cached = curveCache.get(key)
  if (cached) return cached
  const samples = 2048
  const curve = new Float32Array(samples)
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount)
  }
  curveCache.set(key, curve)
  return curve
}

interface Voice {
  ctx: Ctx
  out: GainNode
  sources: AudioScheduledSourceNode[]
  extras: AudioNode[]
}

const beginVoice = (ctx: Ctx): Voice => ({ ctx, out: createOutput(ctx), sources: [], extras: [] })

const addOsc = (
  voice: Voice,
  shape: OscillatorType | PeriodicWave,
  frequency: number,
  when: number,
  stopAt: number,
  target: AudioNode,
  level = 1,
  detune = 0,
) => {
  const { ctx } = voice
  const osc = ctx.createOscillator()
  if (shape instanceof PeriodicWave) osc.setPeriodicWave(shape)
  else osc.type = shape
  osc.frequency.value = frequency
  osc.detune.value = detune
  const gain = ctx.createGain()
  gain.gain.value = level
  osc.connect(gain)
  gain.connect(target)
  osc.start(when)
  osc.stop(stopAt)
  voice.sources.push(osc)
  return { osc, gain }
}

const addNoise = (
  voice: Voice,
  when: number,
  stopAt: number,
  target: AudioNode,
  options: { type?: BiquadFilterType; frequency?: number; q?: number; rate?: number; level?: number } = {},
) => {
  const { ctx } = voice
  const noise = ctx.createBufferSource()
  noise.buffer = makeNoiseBuffer(ctx)
  noise.loop = true
  noise.playbackRate.value = options.rate ?? 1
  const filter = ctx.createBiquadFilter()
  filter.type = options.type ?? 'bandpass'
  filter.frequency.value = options.frequency ?? 2000
  filter.Q.value = options.q ?? 0.8
  const gain = ctx.createGain()
  gain.gain.value = options.level ?? 1
  noise.connect(filter)
  filter.connect(gain)
  gain.connect(target)
  noise.start(when, Math.random() * 1.5)
  noise.stop(stopAt)
  voice.sources.push(noise)
  return { noise, filter, gain }
}

/** A short percussive burst: exponential decay from `peak` over `decay` seconds. */
const burst = (gain: GainNode, when: number, peak: number, decay: number, attack = 0.001) => {
  gain.gain.setValueAtTime(0.0001, when)
  gain.gain.linearRampToValueAtTime(Math.max(0.0001, peak), when + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay)
}

const makeFilter = (ctx: Ctx, type: BiquadFilterType, frequency: number, q = 0.7, gainDb = 0) => {
  const filter = ctx.createBiquadFilter()
  filter.type = type
  filter.frequency.value = frequency
  filter.Q.value = q
  filter.gain.value = gainDb
  return filter
}

/** Chain nodes left-to-right and return the first. */
const chain = (...nodes: AudioNode[]) => {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1])
  return nodes[0]
}

const lfo = (voice: Voice, rate: number, depth: number, when: number, stopAt: number, target: AudioParam, delay = 0) => {
  const { ctx } = voice
  const osc = ctx.createOscillator()
  osc.frequency.value = rate
  const gain = ctx.createGain()
  if (delay > 0) {
    gain.gain.setValueAtTime(0, when)
    gain.gain.setValueAtTime(0, when + delay * 0.5)
    gain.gain.linearRampToValueAtTime(depth, when + delay)
  } else {
    gain.gain.value = depth
  }
  osc.connect(gain)
  gain.connect(target)
  osc.start(when)
  osc.stop(stopAt)
  voice.sources.push(osc)
  return gain
}

const done = (voice: Voice, instrument: InstrumentId, destination: AudioNode, end: number, tail: AudioNode = voice.out) => {
  tail.connect(destination)
  finalize(voice.out, voice.ctx, voice.sources, end)
  return makeVoice(voice.ctx, instrument, voice.out, voice.sources, end, voice.extras)
}

/** Pan a pitched instrument the way a player hears it: lows left, highs right. */
const keyboardPan = (ctx: Ctx, pitch: number, width = 0.42) => {
  const panner = ctx.createStereoPanner()
  panner.pan.value = clamp(((pitch - 64) / 40) * width, -width, width)
  return panner
}

// ── Strings: struck & plucked ──────────────────────────────────────────

interface StringModel {
  /** Number of partials before band-limiting. */
  partials: number
  /** Inharmonicity coefficient at middle C. */
  inharmonicity: number
  /** Where the string is struck/plucked (0..0.5) — carves comb notches. */
  strikePoint: number
  /** Spectral tilt; higher = darker. Velocity brightens it. */
  rolloff: number
  /** Base decay (seconds) of the fundamental at middle C. */
  decay: number
  /** How much faster each higher partial dies. */
  partialDamping: number
  /** Unison strings for beating; 1 = single string. */
  unison: number
  /** Cents between unison strings. */
  unisonCents: number
}

const strikeString = (
  voice: Voice,
  model: StringModel,
  pitch: number,
  when: number,
  velocity: number,
  target: AudioNode,
  stopAt: number,
) => {
  const { ctx } = voice
  const f = midiToHz(pitch)
  const B = model.inharmonicity * Math.pow(2, (pitch - 60) / 18)
  const baseDecay = model.decay * Math.pow(0.5, (pitch - 60) / 20)
  const tilt = model.rolloff - velocity * 0.55
  let longest = 0
  for (let n = 1; n <= model.partials; n++) {
    const fn = n * f * Math.sqrt(1 + B * n * n)
    if (fn > Math.min(16000, ctx.sampleRate * 0.42)) break
    const comb = 0.25 + 0.75 * Math.abs(Math.sin(Math.PI * n * model.strikePoint))
    const amp = (comb / Math.pow(n, tilt)) * (n === 1 ? 1 : 0.85)
    const decay = clamp(baseDecay / (1 + (n - 1) * model.partialDamping), 0.08, 14)
    longest = Math.max(longest, decay)
    const strings = n <= 4 ? model.unison : 1
    for (let s = 0; s < strings; s++) {
      const spread = strings === 1 ? 0 : (s / (strings - 1) - 0.5) * 2
      const detune = spread * model.unisonCents + (Math.random() - 0.5) * 0.4
      const { gain } = addOsc(voice, 'sine', fn, when, stopAt, target, 0, detune)
      const level = (amp / strings) * 0.55
      // Two-stage decay: a quick "prompt" sound settling into a long aftersound.
      gain.gain.setValueAtTime(0, when)
      gain.gain.linearRampToValueAtTime(level, when + 0.0025)
      gain.gain.exponentialRampToValueAtTime(level * 0.45, when + 0.03 + decay * 0.08)
      gain.gain.exponentialRampToValueAtTime(0.0001, when + decay)
    }
  }
  return longest
}

const GRAND: StringModel = {
  partials: 11,
  inharmonicity: 0.00035,
  strikePoint: 0.123,
  rolloff: 1.45,
  decay: 5.2,
  partialDamping: 0.42,
  unison: 2,
  unisonCents: 1.1,
}

const playGrand = (
  ctx: Ctx,
  destination: AudioNode,
  pitch: number,
  when: number,
  duration: number,
  velocity: number,
) => {
  const voice = beginVoice(ctx)
  const f = midiToHz(pitch)
  const brightness = clamp(f * (5 + velocity * 12) + 1600, 1800, 17000)
  const tone = makeFilter(ctx, 'lowpass', brightness, 0.4)
  tone.frequency.setValueAtTime(brightness, when)
  tone.frequency.exponentialRampToValueAtTime(Math.max(900, brightness * 0.42), when + 2.4)
  const body = makeFilter(ctx, 'peaking', 180, 0.8, 2.5)
  const panner = keyboardPan(ctx, pitch)
  voice.extras.push(tone, body, panner)
  chain(tone, body, voice.out, panner)

  const natural = 14 * Math.pow(0.5, (pitch - 36) / 16)
  const stopAt = when + Math.min(natural, duration + 1.2) + 0.1
  const longest = strikeString(voice, GRAND, pitch, when, velocity, tone, stopAt)

  // Hammer felt and key thump.
  const hammer = addNoise(voice, when, when + 0.08, voice.out, {
    type: 'bandpass',
    frequency: Math.min(7000, f * 6 + 900),
    q: 0.9,
    rate: 1.4,
  })
  burst(hammer.gain, when, 0.05 * Math.pow(velocity, 1.4), 0.035)
  const thump = addNoise(voice, when, when + 0.06, voice.out, { type: 'lowpass', frequency: 320, q: 0.6 })
  burst(thump.gain, when, 0.05 * velocity, 0.04)

  const peak = 0.21 + velocity * 0.22
  const end = when + duration
  const hasDamper = pitch < 89
  voice.out.gain.setValueAtTime(peak, when)
  holdParam(voice.out.gain, end)
  voice.out.gain.setTargetAtTime(0.0001, end, hasDamper ? 0.07 + (60 - Math.min(60, pitch)) * 0.002 : 0.35)
  const endTime = Math.min(when + longest, end + (hasDamper ? 0.6 : 1.6)) + 0.05

  // A soft damper felt landing on the strings.
  if (hasDamper && duration < longest) {
    const felt = addNoise(voice, end, end + 0.08, voice.out, { type: 'lowpass', frequency: 500, q: 0.5 })
    burst(felt.gain, end, 0.012 * velocity, 0.06, 0.005)
  }
  return done(voice, 'grand', destination, endTime, panner)
}

const STEEL: StringModel = {
  partials: 12,
  inharmonicity: 0.00012,
  strikePoint: 0.17,
  rolloff: 1.05,
  decay: 3.1,
  partialDamping: 0.36,
  unison: 1,
  unisonCents: 0,
}

const playSteelGuitar = (
  ctx: Ctx,
  destination: AudioNode,
  pitch: number,
  when: number,
  duration: number,
  velocity: number,
) => {
  const voice = beginVoice(ctx)
  const f = midiToHz(pitch)
  const tone = makeFilter(ctx, 'lowpass', clamp(f * 14 + 2200 * velocity, 2400, 12000), 0.5)
  const bodyLow = makeFilter(ctx, 'peaking', 105, 1.4, 5)
  const bodyMid = makeFilter(ctx, 'peaking', 230, 1.2, 3)
  const air = makeFilter(ctx, 'highshelf', 4200, 0.7, 2.5)
  const panner = ctx.createStereoPanner()
  panner.pan.value = -0.08
  voice.extras.push(tone, bodyLow, bodyMid, air, panner)
  chain(tone, bodyLow, bodyMid, air, voice.out, panner)

  const stopAt = when + Math.min(6, duration + 0.9)
  const longest = strikeString(voice, STEEL, pitch, when, velocity, tone, stopAt)

  const pick = addNoise(voice, when, when + 0.03, voice.out, { type: 'highpass', frequency: 2600, q: 0.6, rate: 1.2 })
  burst(pick.gain, when, 0.045 * velocity, 0.012)

  const peak = 0.15 + velocity * 0.12
  const end = when + duration
  voice.out.gain.setValueAtTime(peak, when)
  holdParam(voice.out.gain, end)
  voice.out.gain.setTargetAtTime(0.0001, end, 0.08)
  const endTime = Math.min(when + longest, end + 0.5) + 0.05
  return done(voice, 'steelguitar', destination, Math.min(endTime, stopAt), panner)
}

const playUpright = (
  ctx: Ctx,
  destination: AudioNode,
  pitch: number,
  when: number,
  duration: number,
  velocity: number,
) => {
  const voice = beginVoice(ctx)
  const f = midiToHz(pitch)
  const wave = harmonicWave(ctx, 'upright', [1, 0.55, 0.34, 0.2, 0.13, 0.08, 0.05, 0.03])
  const filter = makeFilter(ctx, 'lowpass', f * 8, 0.8)
  filter.frequency.setValueAtTime(clamp(f * 7 + 900 * velocity, 400, 5000), when)
  filter.frequency.setTargetAtTime(Math.max(180, f * 2.4), when + 0.02, 0.18)
  const body = makeFilter(ctx, 'peaking', 110, 1.2, 4)
  voice.extras.push(filter, body)
  chain(filter, body, voice.out)

  const decayTau = 0.5 + clamp((48 - pitch) * 0.02, 0, 0.5)
  const natural = when + decayTau * 6
  const end = when + duration
  const stopAt = Math.min(natural, end + 0.3) + 0.05
  const { osc } = addOsc(voice, wave, f, when, stopAt, filter, 1)
  osc.detune.setValueAtTime(22, when)
  osc.detune.exponentialRampToValueAtTime(0.5, when + 0.06)

  const thump = addNoise(voice, when, when + 0.07, voice.out, { type: 'lowpass', frequency: 380, q: 0.7 })
  burst(thump.gain, when, 0.12 * velocity, 0.05)
  const finger = addNoise(voice, when, when + 0.03, voice.out, { type: 'bandpass', frequency: 1500, q: 1.2 })
  burst(finger.gain, when, 0.02 * velocity, 0.018)

  const peak = 0.13 + velocity * 0.1
  voice.out.gain.setValueAtTime(0.0001, when)
  voice.out.gain.linearRampToValueAtTime(peak, when + 0.004)
  voice.out.gain.setTargetAtTime(peak * 0.0001, when + 0.012, decayTau)
  holdParam(voice.out.gain, end)
  voice.out.gain.setTargetAtTime(0.0001, end, 0.04)
  return done(voice, 'upright', destination, stopAt)
}

// ── Keys & mallets ─────────────────────────────────────────────────────

const playClav = (
  ctx: Ctx,
  destination: AudioNode,
  pitch: number,
  when: number,
  duration: number,
  velocity: number,
) => {
  const voice = beginVoice(ctx)
  const f = midiToHz(pitch)
  const wave = harmonicWave(ctx, 'clav-pulse', pulseAmps(0.22, 40))
  const highpass = makeFilter(ctx, 'highpass', 160, 0.6)
  const filter = makeFilter(ctx, 'lowpass', 4000, 3.2)
  const start = clamp(f * 10 + 5200 * velocity, 1500, 14000)
  filter.frequency.setValueAtTime(start, when)
  filter.frequency.setTargetAtTime(Math.max(700, f * 3), when + 0.005, 0.11)
  const pickup = makeFilter(ctx, 'peaking', 1300, 1.6, 4)
  voice.extras.push(highpass, filter, pickup)
  chain(highpass, filter, pickup, voice.out)

  const end = when + duration
  const stopAt = end + 0.12
  addOsc(voice, wave, f, when, stopAt, highpass, 0.7)
  addOsc(voice, wave, f, when, stopAt, highpass, 0.35, 5)

  const releaseClick = addNoise(voice, end, end + 0.03, voice.out, { type: 'highpass', frequency: 3000, q: 0.6 })
  burst(releaseClick.gain, end, 0.018 * velocity, 0.015)

  const finalEnd = applyEnvelope(voice.out, when, duration, {
    attack: 0.002,
    decay: 0.45 + clamp((72 - pitch) * 0.01, 0, 0.4),
    sustain: 0.32,
    release: 0.05,
    peak: 0.12 + velocity * 0.12,
  })
  return done(voice, 'clav', destination, finalEnd)
}

const playSteelPan = (
  ctx: Ctx,
  destination: AudioNode,
  pitch: number,
  when: number,
  duration: number,
  velocity: number,
) => {
  const voice = beginVoice(ctx)
  const f = midiToHz(pitch)
  const tone = makeFilter(ctx, 'lowpass', 6500, 0.5)
  const panner = keyboardPan(ctx, pitch, 0.3)
  voice.extras.push(tone, panner)
  chain(tone, voice.out, panner)

  const ring = clamp(1.9 * Math.pow(0.5, (pitch - 60) / 24), 0.5, 3)
  const stopAt = when + Math.min(ring, duration + 0.9) + 0.1
  const partials = [
    { ratio: 1, level: 1, decay: ring, bloom: 0 },
    { ratio: 2, level: 0.55, decay: ring * 0.6, bloom: 0.035, detune: 4 },
    { ratio: 3, level: 0.2, decay: ring * 0.35, bloom: 0.02, detune: -3 },
    { ratio: 4.02, level: 0.08, decay: ring * 0.2, bloom: 0 },
  ]
  for (const partial of partials) {
    if (f * partial.ratio > 15000) continue
    const { gain } = addOsc(voice, 'sine', f * partial.ratio, when, stopAt, tone, 0, partial.detune ?? 0)
    const level = partial.level * 0.4
    gain.gain.setValueAtTime(0, when)
    gain.gain.linearRampToValueAtTime(level * (partial.bloom ? 0.55 : 1), when + 0.005)
    if (partial.bloom) gain.gain.linearRampToValueAtTime(level, when + 0.005 + partial.bloom)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + partial.decay)
  }
  const mallet = addNoise(voice, when, when + 0.03, voice.out, { type: 'bandpass', frequency: f * 3, q: 1.5 })
  burst(mallet.gain, when, 0.05 * velocity, 0.015)

  const peak = 0.2 + velocity * 0.2
  const end = when + duration
  voice.out.gain.setValueAtTime(peak, when)
  holdParam(voice.out.gain, end)
  voice.out.gain.setTargetAtTime(0.0001, end, 0.16)
  return done(voice, 'steelpan', destination, stopAt, panner)
}

const playPipeOrgan = (
  ctx: Ctx,
  destination: AudioNode,
  pitch: number,
  when: number,
  duration: number,
  velocity: number,
) => {
  const voice = beginVoice(ctx)
  const f = midiToHz(pitch)
  // One wavetable holds every rank as a harmonic of the 16' pipe (f / 2):
  // h1 = 16', h2 = 8', h4 = 4', h6 = 2⅔', h8 = 2', with a flute flavour on the 8'.
  const low = pitch < 62
  const ranks = [low ? 0.38 : 0.12, 1, 0, 0.62, 0, 0.3, 0, 0.24, 0, 0.06, 0, 0.08]
  const wave = harmonicWave(ctx, low ? 'pipe-low' : 'pipe-high', ranks)
  const flue = harmonicWave(ctx, 'pipe-flue', [1, 0.28, 0.1, 0.05])
  const tone = makeFilter(ctx, 'lowpass', 7200, 0.4)
  const air = makeFilter(ctx, 'highshelf', 3200, 0.7, -2)
  voice.extras.push(tone, air)
  chain(tone, air, voice.out)

  const end = when + duration
  const stopAt = end + 0.9
  addOsc(voice, wave, f / 2, when, stopAt, tone, 0.62)
  addOsc(voice, flue, f, when, stopAt, tone, 0.32, 5.5)
  addOsc(voice, flue, f, when, stopAt, tone, 0.22, -3.5)

  // Speech: a chiff of wind as the pipe catches, then a whisper of air.
  const chiff = addNoise(voice, when, when + 0.1, voice.out, { type: 'bandpass', frequency: Math.min(9000, f * 3), q: 2 })
  burst(chiff.gain, when, 0.045, 0.07, 0.01)
  const breath = addNoise(voice, when, stopAt, tone, { type: 'bandpass', frequency: Math.min(8000, f * 2), q: 1.2, level: 0.012 })
  void breath

  const finalEnd = applyEnvelope(voice.out, when, duration, {
    attack: 0.07,
    decay: 0.3,
    sustain: 0.92,
    release: 0.42,
    peak: 0.085 + velocity * 0.035,
  })
  return done(voice, 'pipe', destination, finalEnd)
}

// ── Basses ─────────────────────────────────────────────────────────────

const playAcid = (
  ctx: Ctx,
  destination: AudioNode,
  pitch: number,
  when: number,
  duration: number,
  velocity: number,
) => {
  const voice = beginVoice(ctx)
  const f = midiToHz(pitch)
  const accent = velocity > 0.78
  const pre = ctx.createWaveShaper()
  pre.curve = driveCurve(1.6)
  const filter = makeFilter(ctx, 'lowpass', 800, accent ? 17 : 11)
  const top = clamp(260 + f * 2 + (accent ? 4200 : 2400) * velocity, 400, 9000)
  filter.frequency.setValueAtTime(top, when)
  filter.frequency.setTargetAtTime(Math.max(160, f * 1.3), when + 0.004, accent ? 0.075 : 0.11)
  const post = ctx.createWaveShaper()
  post.curve = driveCurve(accent ? 2.4 : 1.7)
  post.oversample = '2x'
  const highpass = makeFilter(ctx, 'highpass', 38, 0.7)
  voice.extras.push(pre, filter, post, highpass)
  chain(pre, filter, post, highpass, voice.out)

  const stopAt = when + duration + 0.1
  addOsc(voice, 'sawtooth', f, when, stopAt, pre, 0.75)

  const finalEnd = applyEnvelope(voice.out, when, duration, {
    attack: 0.003,
    decay: 0.28,
    sustain: 0.78,
    release: 0.045,
    peak: (accent ? 0.2 : 0.15) + velocity * 0.05,
  })
  return done(voice, 'acid', destination, finalEnd)
}

const playPulseBass = (
  ctx: Ctx,
  destination: AudioNode,
  pitch: number,
  when: number,
  duration: number,
  velocity: number,
) => {
  const voice = beginVoice(ctx)
  const f = midiToHz(pitch)
  const filter = makeFilter(ctx, 'lowpass', 600, 3.2)
  filter.frequency.setValueAtTime(clamp(500 + 2000 * velocity + f * 2, 500, 5000), when)
  filter.frequency.setTargetAtTime(Math.max(260, f * 3), when + 0.004, 0.09)
  const shaper = ctx.createWaveShaper()
  shaper.curve = driveCurve(1.4)
  voice.extras.push(filter, shaper)
  chain(filter, shaper, voice.out)

  const stopAt = when + duration + 0.15
  addOsc(voice, 'square', f, when, stopAt, filter, 0.35, -7)
  addOsc(voice, 'square', f, when, stopAt, filter, 0.35, 7)
  addOsc(voice, 'sine', f, when, stopAt, shaper, 0.5)

  const finalEnd = applyEnvelope(voice.out, when, duration, {
    attack: 0.004,
    decay: 0.22,
    sustain: 0.72,
    release: 0.07,
    peak: 0.2 + velocity * 0.08,
  })
  return done(voice, 'pulsebass', destination, finalEnd)
}

// ── Pads ───────────────────────────────────────────────────────────────

const stereoPair = (ctx: Ctx, voice: Voice, width: number) => {
  const left = ctx.createStereoPanner()
  left.pan.value = -width
  const right = ctx.createStereoPanner()
  right.pan.value = width
  left.connect(voice.out)
  right.connect(voice.out)
  voice.extras.push(left, right)
  return { left, right }
}

const playVelour = (
  ctx: Ctx,
  destination: AudioNode,
  pitch: number,
  when: number,
  duration: number,
  velocity: number,
) => {
  const voice = beginVoice(ctx)
  const f = midiToHz(pitch)
  const open = clamp(1500 + velocity * 1800 + f, 1200, 7000)
  const { left, right } = stereoPair(ctx, voice, 0.62)
  // Each side gets its own filter so the swell opens across the stereo field.
  const side = (panTarget: AudioNode) => {
    const highpass = makeFilter(ctx, 'highpass', 110, 0.6)
    const filter = makeFilter(ctx, 'lowpass', 420, 1.1)
    filter.frequency.setValueAtTime(420, when)
    filter.frequency.linearRampToValueAtTime(open, when + 0.9)
    filter.frequency.setTargetAtTime(open * 0.72, when + 1, 1.4)
    voice.extras.push(highpass, filter)
    chain(highpass, filter, panTarget)
    return highpass
  }
  const sides = [side(left), side(right)]

  const stopAt = when + duration + 2
  const oscs = [-15, -5, 5, 15].map(
    (cents, i) => addOsc(voice, 'sawtooth', f, when, stopAt, sides[i % 2], 0.22, cents).osc,
  )
  // Slow ensemble drift — the voices breathe against each other.
  const drift = lfo(voice, 0.31, 5, when, stopAt, oscs[0].detune)
  drift.connect(oscs[3].detune)
  const counter = lfo(voice, 0.43, -5, when, stopAt, oscs[1].detune)
  counter.connect(oscs[2].detune)

  const finalEnd = applyEnvelope(voice.out, when, duration, {
    attack: 0.38,
    decay: 1.6,
    sustain: 0.78,
    release: 1.5,
    peak: 0.13 + velocity * 0.065,
  })
  return done(voice, 'velour', destination, finalEnd)
}

const playCrystal = (
  ctx: Ctx,
  destination: AudioNode,
  pitch: number,
  when: number,
  duration: number,
  velocity: number,
) => {
  const voice = beginVoice(ctx)
  const f = midiToHz(pitch)
  const glass = harmonicWave(ctx, 'crystal', [1, 0.04, 0.46, 0.02, 0.3, 0, 0.21, 0.05, 0.15, 0, 0.1, 0, 0.06])
  const highpass = makeFilter(ctx, 'highpass', 220, 0.6)
  const tone = makeFilter(ctx, 'lowpass', 9000, 0.4)
  const tremolo = ctx.createGain()
  tremolo.gain.value = 0.86
  voice.extras.push(highpass, tone, tremolo)
  const { left, right } = stereoPair(ctx, voice, 0.55)
  chain(highpass, tone, tremolo)
  tremolo.connect(left)
  tremolo.connect(right)

  const stopAt = when + duration + 2.4
  const a = addOsc(voice, glass, f, when, stopAt, highpass, 0.3, -6)
  const b = addOsc(voice, glass, f, when, stopAt, highpass, 0.3, 6)
  a.gain.disconnect()
  b.gain.disconnect()
  a.gain.connect(left)
  b.gain.connect(right)
  // A shimmering octave that blooms in slowly.
  const shimmer = addOsc(voice, 'sine', f * 2, when, stopAt, tremolo, 0)
  shimmer.gain.gain.setValueAtTime(0, when)
  shimmer.gain.gain.linearRampToValueAtTime(0.12, when + 1.6)
  lfo(voice, 0.21, 0.14, when, stopAt, tremolo.gain)

  const finalEnd = applyEnvelope(voice.out, when, duration, {
    attack: 0.55,
    decay: 2,
    sustain: 0.82,
    release: 2,
    peak: 0.11 + velocity * 0.05,
  })
  return done(voice, 'crystal', destination, finalEnd)
}

const playTapeStrings = (
  ctx: Ctx,
  destination: AudioNode,
  pitch: number,
  when: number,
  duration: number,
  velocity: number,
) => {
  const voice = beginVoice(ctx)
  const f = midiToHz(pitch)
  const highpass = makeFilter(ctx, 'highpass', 290, 0.7)
  const lowpass = makeFilter(ctx, 'lowpass', 2900 + velocity * 1300, 0.8)
  const presence = makeFilter(ctx, 'peaking', 1150, 1, 3)
  voice.extras.push(highpass, lowpass, presence)
  chain(highpass, lowpass, presence, voice.out)

  const stopAt = when + duration + 0.9
  const oscs = [-9, 0, 8].map((cents) => addOsc(voice, 'sawtooth', f, when, stopAt, highpass, 0.2, cents).osc)
  // Tape transport: slow wow and fast flutter on every voice.
  const wow = lfo(voice, 0.55, 8, when, stopAt, oscs[0].detune)
  wow.connect(oscs[1].detune)
  wow.connect(oscs[2].detune)
  const flutter = lfo(voice, 6.4, 2.2, when, stopAt, oscs[0].detune)
  flutter.connect(oscs[1].detune)
  flutter.connect(oscs[2].detune)
  addNoise(voice, when, stopAt, voice.out, { type: 'highpass', frequency: 5000, q: 0.5, level: 0.006 })

  const finalEnd = applyEnvelope(voice.out, when, duration, {
    attack: 0.13,
    decay: 0.8,
    sustain: 0.86,
    release: 0.5,
    peak: 0.085 + velocity * 0.05,
  })
  return done(voice, 'tapestrings', destination, finalEnd)
}

// ── Leads ──────────────────────────────────────────────────────────────

const playChip = (
  ctx: Ctx,
  destination: AudioNode,
  pitch: number,
  when: number,
  duration: number,
  velocity: number,
) => {
  const voice = beginVoice(ctx)
  const f = midiToHz(pitch)
  const wave = harmonicWave(ctx, 'chip-25', pulseAmps(0.25, 36))
  const tone = makeFilter(ctx, 'lowpass', 11000, 0.4)
  voice.extras.push(tone)
  chain(tone, voice.out)
  const stopAt = when + duration + 0.08
  const { osc } = addOsc(voice, wave, f, when, stopAt, tone, 0.8)
  osc.detune.setValueAtTime(200, when)
  osc.detune.setValueAtTime(0, when + 0.028)
  lfo(voice, 5.8, 22, when, stopAt, osc.detune, 0.45)

  const finalEnd = applyEnvelope(voice.out, when, duration, {
    attack: 0.002,
    decay: 0.12,
    sustain: 0.78,
    release: 0.035,
    peak: 0.1 + velocity * 0.08,
  })
  return done(voice, 'chip', destination, finalEnd)
}

const playTrumpet = (
  ctx: Ctx,
  destination: AudioNode,
  pitch: number,
  when: number,
  duration: number,
  velocity: number,
) => {
  const voice = beginVoice(ctx)
  const f = midiToHz(pitch)
  const filter = makeFilter(ctx, 'lowpass', 500, 1)
  const bright = clamp(f * 4 + 900 + 2400 * velocity, 1200, 9000)
  filter.frequency.setValueAtTime(420, when)
  filter.frequency.linearRampToValueAtTime(bright, when + 0.05)
  filter.frequency.setTargetAtTime(bright * 0.7, when + 0.06, 0.25)
  const mute = makeFilter(ctx, 'peaking', 1750, 2.4, 9)
  const highpass = makeFilter(ctx, 'highpass', 430, 0.8)
  const top = makeFilter(ctx, 'lowpass', 5200, 0.5)
  voice.extras.push(filter, mute, highpass, top)
  chain(filter, mute, highpass, top, voice.out)

  const stopAt = when + duration + 0.25
  const { osc } = addOsc(voice, 'sawtooth', f, when, stopAt, filter, 0.5)
  osc.detune.setValueAtTime(-42, when)
  osc.detune.setTargetAtTime(0, when, 0.025)
  lfo(voice, 5.2, 13, when, stopAt, osc.detune, 0.45)
  const breath = addNoise(voice, when, stopAt, mute, { type: 'bandpass', frequency: 1800, q: 1.4 })
  breath.gain.gain.setValueAtTime(0.03 * velocity, when)
  breath.gain.gain.setTargetAtTime(0.008 * velocity, when + 0.04, 0.08)

  const finalEnd = applyEnvelope(voice.out, when, duration, {
    attack: 0.035,
    decay: 0.22,
    sustain: 0.82,
    release: 0.13,
    peak: 0.11 + velocity * 0.08,
  })
  return done(voice, 'trumpet', destination, finalEnd)
}

const playOcarina = (
  ctx: Ctx,
  destination: AudioNode,
  pitch: number,
  when: number,
  duration: number,
  velocity: number,
) => {
  const voice = beginVoice(ctx)
  const f = midiToHz(pitch)
  const tone = makeFilter(ctx, 'lowpass', 4200, 0.5)
  voice.extras.push(tone)
  chain(tone, voice.out)
  const stopAt = when + duration + 0.3
  const main = addOsc(voice, 'sine', f, when, stopAt, tone, 0.8)
  addOsc(voice, 'triangle', f, when, stopAt, tone, 0.14, 3)
  addOsc(voice, 'sine', f * 2, when, stopAt, tone, 0.05)
  lfo(voice, 5, 11, when, stopAt, main.osc.detune, 0.35)
  const breath = addNoise(voice, when, stopAt, tone, { type: 'bandpass', frequency: Math.min(9000, f * 2), q: 1.6 })
  breath.gain.gain.setValueAtTime(0.12 * velocity, when)
  breath.gain.gain.setTargetAtTime(0.035, when + 0.03, 0.06)

  const finalEnd = applyEnvelope(voice.out, when, duration, {
    attack: 0.05,
    decay: 0.3,
    sustain: 0.82,
    release: 0.16,
    peak: 0.07 + velocity * 0.04,
  })
  return done(voice, 'ocarina', destination, finalEnd)
}

// ── Drum machines with metallic cymbals ────────────────────────────────

type MachineStyle = 'trap' | 'house' | 'breaks'

interface MachineProfile {
  tone: number
  drive: number
  kickStart: number
  kickEnd: number
  kickSweep: number
  kickDecay: number
  kickPeak: number
  kickClick: number
  snareTones: [number, number]
  snareToneDecay: number
  snareNoiseFreq: number
  snareNoiseDecay: number
  snareNoisePeak: number
  clapBursts: number
  clapSpacing: number
  clapDecay: number
  clapFreq: number
  hatScale: number
  hatClosed: number
  hatOpen: number
  tomBase: number
  crashDecay: number
  rideDecay: number
}

const MACHINES: Record<MachineStyle, MachineProfile> = {
  trap: {
    tone: 14000,
    drive: 2.6,
    kickStart: 165,
    kickEnd: 46,
    kickSweep: 0.07,
    kickDecay: 1.5,
    kickPeak: 0.8,
    kickClick: 0.1,
    snareTones: [195, 330],
    snareToneDecay: 0.09,
    snareNoiseFreq: 4400,
    snareNoiseDecay: 0.17,
    snareNoisePeak: 0.34,
    clapBursts: 3,
    clapSpacing: 0.011,
    clapDecay: 0.2,
    clapFreq: 1700,
    hatScale: 1.15,
    hatClosed: 0.035,
    hatOpen: 0.34,
    tomBase: 120,
    crashDecay: 1.4,
    rideDecay: 1.1,
  },
  house: {
    tone: 13000,
    drive: 1.7,
    kickStart: 250,
    kickEnd: 52,
    kickSweep: 0.045,
    kickDecay: 0.48,
    kickPeak: 0.88,
    kickClick: 0.16,
    snareTones: [180, 330],
    snareToneDecay: 0.11,
    snareNoiseFreq: 3600,
    snareNoiseDecay: 0.24,
    snareNoisePeak: 0.3,
    clapBursts: 4,
    clapSpacing: 0.009,
    clapDecay: 0.3,
    clapFreq: 1250,
    hatScale: 1,
    hatClosed: 0.06,
    hatOpen: 0.44,
    tomBase: 135,
    crashDecay: 1.7,
    rideDecay: 1.6,
  },
  breaks: {
    tone: 7600,
    drive: 2,
    kickStart: 125,
    kickEnd: 52,
    kickSweep: 0.06,
    kickDecay: 0.34,
    kickPeak: 0.8,
    kickClick: 0.07,
    snareTones: [205, 290],
    snareToneDecay: 0.14,
    snareNoiseFreq: 2500,
    snareNoiseDecay: 0.27,
    snareNoisePeak: 0.34,
    clapBursts: 3,
    clapSpacing: 0.014,
    clapDecay: 0.18,
    clapFreq: 1400,
    hatScale: 0.85,
    hatClosed: 0.075,
    hatOpen: 0.42,
    tomBase: 110,
    crashDecay: 1.2,
    rideDecay: 1.2,
  },
}

/** The classic six-oscillator metal cluster (inharmonic square waves). */
const METAL_RATIOS = [1, 1.483, 1.801, 2.546, 2.631, 3.897]

const metalCluster = (
  voice: Voice,
  base: number,
  when: number,
  stopAt: number,
  target: AudioNode,
  level: number,
) => {
  const mix = voice.ctx.createGain()
  mix.gain.value = level
  mix.connect(target)
  voice.extras.push(mix)
  for (const ratio of METAL_RATIOS) addOsc(voice, 'square', base * ratio, when, stopAt, mix, 0.16)
  return mix
}

const playMachineDrum = (
  ctx: Ctx,
  destination: AudioNode,
  pitch: number,
  when: number,
  velocity: number,
  style: MachineStyle,
): VoiceHandle => {
  const p = MACHINES[style]
  const voice = beginVoice(ctx)
  const tone = makeFilter(ctx, 'lowpass', p.tone, 0.5)
  const shaper = ctx.createWaveShaper()
  shaper.curve = driveCurve(p.drive)
  shaper.oversample = '2x'
  const panner = ctx.createStereoPanner()
  panner.pan.value =
    pitch === 42 || pitch === 46 ? 0.24 : pitch === 41 ? -0.22 : pitch === 43 ? 0.16 : pitch === 51 ? -0.18 : pitch === 49 ? 0.12 : 0
  voice.extras.push(tone, shaper, panner)
  chain(voice.out, tone, shaper, panner)
  panner.connect(destination)
  voice.out.gain.setValueAtTime(0.9, when)
  const level = 0.45 + velocity * 0.55
  let end = when + 0.4

  const noiseHit = (
    decay: number,
    type: BiquadFilterType,
    frequency: number,
    q: number,
    peak: number,
    at = when,
    rate = 1,
  ) => {
    const hit = addNoise(voice, at, at + decay + 0.03, voice.out, { type, frequency, q, rate })
    burst(hit.gain, at, peak, decay)
    end = Math.max(end, at + decay)
    return hit
  }

  if (pitch === 36) {
    const stopAt = when + p.kickDecay + 0.05
    const sub = addOsc(voice, 'sine', p.kickStart, when, stopAt, voice.out, 0)
    sub.osc.frequency.setValueAtTime(p.kickStart, when)
    sub.osc.frequency.exponentialRampToValueAtTime(p.kickEnd, when + p.kickSweep)
    sub.osc.frequency.exponentialRampToValueAtTime(p.kickEnd * 0.92, when + p.kickDecay)
    sub.gain.gain.setValueAtTime(0.0001, when)
    sub.gain.gain.linearRampToValueAtTime(p.kickPeak * level, when + 0.003)
    sub.gain.gain.setTargetAtTime(0.0001, when + 0.02, p.kickDecay / 4.5)
    const body = addOsc(voice, 'triangle', p.kickStart * 1.6, when, when + 0.08, voice.out, 0)
    body.osc.frequency.exponentialRampToValueAtTime(p.kickEnd * 2, when + 0.04)
    burst(body.gain, when, 0.22 * level, 0.05)
    noiseHit(0.01, 'highpass', 3200, 0.7, p.kickClick * level, when, 1.4)
    end = stopAt
  } else if (pitch === 38) {
    for (const [index, freq] of p.snareTones.entries()) {
      const body = addOsc(voice, 'triangle', freq, when, when + p.snareToneDecay + 0.04, voice.out, 0)
      body.osc.frequency.exponentialRampToValueAtTime(freq * 0.82, when + p.snareToneDecay)
      burst(body.gain, when, (index === 0 ? 0.32 : 0.18) * level, p.snareToneDecay)
    }
    noiseHit(p.snareNoiseDecay, 'bandpass', p.snareNoiseFreq, 0.8, p.snareNoisePeak * level, when, 1.05)
    noiseHit(p.snareNoiseDecay * 0.6, 'highpass', 6200, 0.7, p.snareNoisePeak * 0.5 * level, when, 1.2)
  } else if (pitch === 39) {
    for (let i = 0; i < p.clapBursts; i++) {
      const at = when + i * p.clapSpacing
      noiseHit(i === p.clapBursts - 1 ? p.clapDecay : 0.012, 'bandpass', p.clapFreq, 1.1, 0.3 * level, at)
    }
    noiseHit(p.clapDecay * 1.5, 'bandpass', p.clapFreq * 1.4, 0.6, 0.05 * level, when + 0.02)
  } else if (pitch === 42 || pitch === 46) {
    const open = pitch === 46
    const decay = open ? p.hatOpen : p.hatClosed
    const stopAt = when + decay + 0.04
    const band = makeFilter(ctx, 'bandpass', 10200, 0.9)
    const high = makeFilter(ctx, 'highpass', 7200, 0.6)
    const env = ctx.createGain()
    voice.extras.push(band, high, env)
    chain(band, high, env, voice.out)
    metalCluster(voice, 320 * p.hatScale, when, stopAt, band, 1)
    burst(env, when, (open ? 0.42 : 0.5) * level, decay)
    noiseHit(decay * 0.7, 'highpass', 9000, 0.6, 0.05 * level, when, 1.3)
    end = stopAt
  } else if (pitch === 37) {
    const click = addOsc(voice, 'triangle', 1700, when, when + 0.04, voice.out, 0)
    burst(click.gain, when, 0.16 * level, 0.02)
    noiseHit(0.03, 'bandpass', 3000, 2.5, 0.2 * level)
  } else if (pitch === 41 || pitch === 43 || pitch === 45) {
    const base = pitch === 41 ? p.tomBase : pitch === 43 ? p.tomBase * 1.9 : p.tomBase * 1.4
    const stopAt = when + 0.5
    const tom = addOsc(voice, 'sine', base * 1.35, when, stopAt, voice.out, 0)
    tom.osc.frequency.exponentialRampToValueAtTime(base, when + 0.03)
    tom.osc.frequency.exponentialRampToValueAtTime(base * 0.8, when + 0.4)
    burst(tom.gain, when, 0.42 * level, 0.42)
    noiseHit(0.05, 'lowpass', 1400, 0.7, 0.06 * level)
    end = stopAt
  } else if (pitch === 49) {
    const stopAt = when + p.crashDecay + 0.05
    const band = makeFilter(ctx, 'highpass', 4800, 0.5)
    const env = ctx.createGain()
    voice.extras.push(band, env)
    chain(band, env, voice.out)
    metalCluster(voice, 410, when, stopAt, band, 1)
    burst(env, when, 0.28 * level, p.crashDecay, 0.002)
    noiseHit(p.crashDecay * 0.9, 'highpass', 6000, 0.5, 0.16 * level, when, 1)
    end = stopAt
  } else if (pitch === 51) {
    const stopAt = when + p.rideDecay + 0.05
    const band = makeFilter(ctx, 'bandpass', 5200, 0.8)
    const env = ctx.createGain()
    voice.extras.push(band, env)
    chain(band, env, voice.out)
    metalCluster(voice, 520, when, stopAt, band, 1)
    burst(env, when, 0.2 * level, p.rideDecay, 0.001)
    // The bell of the ride.
    for (const ratio of [1, 1.47, 2.09]) {
      const bell = addOsc(voice, 'sine', 980 * ratio, when, stopAt, voice.out, 0)
      burst(bell.gain, when, (0.03 / ratio) * level, p.rideDecay * 0.6)
    }
    end = stopAt
  } else if (pitch === 56) {
    const band = makeFilter(ctx, 'bandpass', 950, 1.4)
    const env = ctx.createGain()
    voice.extras.push(band, env)
    chain(band, env, voice.out)
    addOsc(voice, 'square', 540, when, when + 0.36, band, 0.4)
    addOsc(voice, 'square', 800, when, when + 0.36, band, 0.4)
    env.gain.setValueAtTime(0.0001, when)
    env.gain.linearRampToValueAtTime(0.32 * level, when + 0.002)
    env.gain.exponentialRampToValueAtTime(0.08 * level, when + 0.03)
    env.gain.exponentialRampToValueAtTime(0.0001, when + 0.34)
    end = when + 0.36
  } else {
    noiseHit(0.08, 'highpass', 3000, 0.7, 0.06 * level)
  }

  finalize(voice.out, ctx, voice.sources, end)
  return makeVoice(ctx, style, voice.out, voice.sources, end, voice.extras)
}

// ── Dispatcher ─────────────────────────────────────────────────────────

type Player = (
  ctx: Ctx,
  destination: AudioNode,
  pitch: number,
  when: number,
  duration: number,
  velocity: number,
) => VoiceHandle

const PLAYERS: Partial<Record<InstrumentId, Player>> = {
  grand: playGrand,
  clav: playClav,
  steelpan: playSteelPan,
  pipe: playPipeOrgan,
  acid: playAcid,
  upright: playUpright,
  pulsebass: playPulseBass,
  velour: playVelour,
  crystal: playCrystal,
  tapestrings: playTapeStrings,
  steelguitar: playSteelGuitar,
  chip: playChip,
  trumpet: playTrumpet,
  ocarina: playOcarina,
}

const MACHINE_IDS = new Set<InstrumentId>(['trap', 'house', 'breaks'])

/** Plays one of the new voices, or returns null if the id belongs elsewhere. */
export const triggerModernVoice = (
  ctx: Ctx,
  destination: AudioNode,
  instrument: InstrumentId,
  pitch: number,
  when: number,
  duration: number,
  velocity: number,
): VoiceHandle | null => {
  if (MACHINE_IDS.has(instrument)) {
    return playMachineDrum(ctx, destination, pitch, when, velocity, instrument as MachineStyle)
  }
  const player = PLAYERS[instrument]
  return player ? player(ctx, destination, pitch, when, duration, velocity) : null
}
