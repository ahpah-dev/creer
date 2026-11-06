import type { EffectInstance, MasterSettings, Track } from '../types'
import { createEffectChain } from './effects'
import { createReverbImpulse, makeSoftClipCurve } from './synth'

export interface MasterBus {
  input: GainNode
  analyser: AnalyserNode
  masterGain: GainNode
  reverbInput: GainNode
  delayInput: GainNode
  delay: DelayNode
  setVolume: (volume: number) => void
  setReverb: (amount: number) => void
  setDelay: (amount: number) => void
  setDelayTime: (seconds: number) => void
  setEffects: (effects: EffectInstance[]) => void
}

export interface TrackBus {
  input: GainNode
  fader: GainNode
  panner: StereoPannerNode
  analyser: AnalyserNode
  reverbSend: GainNode
  delaySend: GainNode
  setVolume: (volume: number) => void
  setPan: (pan: number) => void
  setSends: (reverb: number, delay: number) => void
  setEffects: (effects: EffectInstance[]) => void
}

const volumeCurve = (value: number) => Math.pow(Math.max(0, Math.min(1, value)), 1.35)

export const createMasterBus = (
  ctx: BaseAudioContext,
  destination: AudioNode,
  settings: MasterSettings,
  bpm: number,
): MasterBus => {
  const input = ctx.createGain()
  const effectChain = createEffectChain(ctx)
  const highpass = ctx.createBiquadFilter()
  highpass.type = 'highpass'
  highpass.frequency.value = 24
  highpass.Q.value = 0.4

  const saturator = ctx.createWaveShaper()
  saturator.curve = makeSoftClipCurve(1.1)
  saturator.oversample = '2x'

  const compressor = ctx.createDynamicsCompressor()
  compressor.threshold.value = -15
  compressor.knee.value = 18
  compressor.ratio.value = 3
  compressor.attack.value = 0.008
  compressor.release.value = 0.24

  const masterGain = ctx.createGain()
  masterGain.gain.value = volumeCurve(settings.volume)

  const analyser = ctx.createAnalyser()
  analyser.fftSize = 512
  analyser.smoothingTimeConstant = 0.65

  input.connect(effectChain.input)
  effectChain.output.connect(highpass)
  highpass.connect(saturator)
  saturator.connect(compressor)
  compressor.connect(masterGain)
  masterGain.connect(analyser)
  analyser.connect(destination)

  // Reverb bus — a small, warm room.
  const reverbInput = ctx.createGain()
  const convolver = ctx.createConvolver()
  convolver.normalize = true
  convolver.buffer = createReverbImpulse(ctx, 2.6)
  const reverbTone = ctx.createBiquadFilter()
  reverbTone.type = 'lowpass'
  reverbTone.frequency.value = 5200
  const reverbReturn = ctx.createGain()
  reverbReturn.gain.value = settings.reverb * 1.1
  reverbInput.connect(convolver)
  convolver.connect(reverbTone)
  reverbTone.connect(reverbReturn)
  reverbReturn.connect(input)

  // Dotted-eighth delay with a softened feedback path.
  const delayInput = ctx.createGain()
  const delay = ctx.createDelay(2)
  delay.delayTime.value = (60 / Math.max(40, bpm)) * 0.75
  const delayFilter = ctx.createBiquadFilter()
  delayFilter.type = 'lowpass'
  delayFilter.frequency.value = 2800
  const feedback = ctx.createGain()
  feedback.gain.value = 0.3
  const delayReturn = ctx.createGain()
  delayReturn.gain.value = settings.delay * 0.8
  delayInput.connect(delay)
  delay.connect(delayFilter)
  delayFilter.connect(feedback)
  feedback.connect(delay)
  delayFilter.connect(delayReturn)
  delayReturn.connect(input)

  effectChain.setEffects(settings.effects)

  return {
    input,
    analyser,
    masterGain,
    reverbInput,
    delayInput,
    delay,
    setVolume: (volume) => {
      masterGain.gain.setTargetAtTime(volumeCurve(volume), ctx.currentTime, 0.02)
    },
    setReverb: (amount) => {
      reverbReturn.gain.setTargetAtTime(amount * 1.1, ctx.currentTime, 0.03)
    },
    setDelay: (amount) => {
      delayReturn.gain.setTargetAtTime(amount * 0.8, ctx.currentTime, 0.03)
    },
    setDelayTime: (seconds) => {
      delay.delayTime.setTargetAtTime(seconds, ctx.currentTime, 0.04)
    },
    setEffects: (effects) => effectChain.setEffects(effects),
  }
}

export const createTrackBus = (
  ctx: BaseAudioContext,
  master: MasterBus,
  track: Track,
): TrackBus => {
  const input = ctx.createGain()
  const effectChain = createEffectChain(ctx)
  const fader = ctx.createGain()
  fader.gain.value = volumeCurve(track.volume)
  const panner = ctx.createStereoPanner()
  panner.pan.value = track.pan
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 256
  analyser.smoothingTimeConstant = 0.72

  const reverbSend = ctx.createGain()
  reverbSend.gain.value = track.reverbSend
  const delaySend = ctx.createGain()
  delaySend.gain.value = track.delaySend

  input.connect(effectChain.input)
  effectChain.output.connect(fader)
  fader.connect(panner)
  panner.connect(analyser)
  analyser.connect(master.input)
  panner.connect(reverbSend)
  reverbSend.connect(master.reverbInput)
  panner.connect(delaySend)
  delaySend.connect(master.delayInput)

  effectChain.setEffects(track.effects)

  return {
    input,
    fader,
    panner,
    analyser,
    reverbSend,
    delaySend,
    setVolume: (volume) => {
      fader.gain.setTargetAtTime(volumeCurve(volume), ctx.currentTime, 0.018)
    },
    setPan: (pan) => {
      panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), ctx.currentTime, 0.02)
    },
    setSends: (reverb, delay) => {
      reverbSend.gain.setTargetAtTime(reverb, ctx.currentTime, 0.03)
      delaySend.gain.setTargetAtTime(delay, ctx.currentTime, 0.03)
    },
    setEffects: (effects) => effectChain.setEffects(effects),
  }
}

export const readAnalyserLevel = (analyser: AnalyserNode, data: Uint8Array) => {
  analyser.getByteTimeDomainData(data)
  let sum = 0
  let peak = 0
  for (let i = 0; i < data.length; i++) {
    const normalized = (data[i] - 128) / 128
    sum += normalized * normalized
    peak = Math.max(peak, Math.abs(normalized))
  }
  return { rms: Math.sqrt(sum / data.length), peak }
}
