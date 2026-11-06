import type { EffectInstance } from '../types'
import { EFFECT_MAP } from '../data/effects'
import { createReverbImpulse, makeSoftClipCurve } from './synth'

type Ctx = BaseAudioContext

export interface EffectGraph {
  id: string
  type: EffectInstance['type']
  input: GainNode
  output: GainNode
  setParams: (params: Record<string, number>) => void
  dispose: () => void
}

export interface EffectChain {
  input: GainNode
  output: GainNode
  setEffects: (effects: EffectInstance[]) => void
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value))

const smooth = (ctx: Ctx, param: AudioParam, value: number, time = 0.025) => {
  param.setTargetAtTime(value, ctx.currentTime, time)
}

const getParam = (type: EffectInstance['type'], params: Record<string, number>, key: string) => {
  const spec = EFFECT_MAP[type].params.find((item) => item.key === key)
  if (!spec) return 0
  const value = params[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : spec.default
}

const createWetDry = (ctx: Ctx) => {
  const input = ctx.createGain()
  const output = ctx.createGain()
  const dry = ctx.createGain()
  const wet = ctx.createGain()
  input.connect(dry)
  dry.connect(output)
  wet.connect(output)
  const setMix = (mix: number) => {
    const value = clamp(mix, 0, 1)
    smooth(ctx, dry.gain, 1 - value, 0.015)
    smooth(ctx, wet.gain, value, 0.015)
  }
  return { input, output, dry, wet, setMix }
}

const finish = (
  _ctx: Ctx,
  effect: EffectInstance,
  input: GainNode,
  output: GainNode,
  nodes: AudioNode[],
  sources: AudioScheduledSourceNode[],
  setParams: (params: Record<string, number>) => void,
): EffectGraph => {
  setParams(effect.params)
  const allNodes = [input, output, ...nodes]
  return {
    id: effect.id,
    type: effect.type,
    input,
    output,
    setParams,
    dispose: () => {
      for (const source of sources) {
        try {
          source.stop()
        } catch {
          /* already stopped */
        }
      }
      for (const node of allNodes) {
        try {
          node.disconnect()
        } catch {
          /* noop */
        }
      }
    },
  }
}

const createFilter = (ctx: Ctx, effect: EffectInstance): EffectGraph => {
  const input = ctx.createGain()
  const filter = ctx.createBiquadFilter()
  const output = ctx.createGain()
  filter.type = 'lowpass'
  input.connect(filter)
  filter.connect(output)
  return finish(ctx, effect, input, output, [filter], [], (params) => {
    smooth(ctx, filter.frequency, clamp(getParam(effect.type, params, 'cutoff'), 40, 18000), 0.035)
    smooth(ctx, filter.Q, clamp(getParam(effect.type, params, 'resonance'), 0.1, 20), 0.035)
  })
}

const createDrive = (ctx: Ctx, effect: EffectInstance): EffectGraph => {
  const mix = createWetDry(ctx)
  const pre = ctx.createGain()
  const shaper = ctx.createWaveShaper()
  const tone = ctx.createBiquadFilter()
  const post = ctx.createGain()
  tone.type = 'lowpass'
  shaper.oversample = '2x'
  mix.input.connect(pre)
  pre.connect(shaper)
  shaper.connect(tone)
  tone.connect(post)
  post.connect(mix.wet)
  return finish(ctx, effect, mix.input, mix.output, [mix.dry, mix.wet, pre, shaper, tone, post], [], (params) => {
    const drive = clamp(getParam(effect.type, params, 'drive'), 1, 16)
    smooth(ctx, pre.gain, drive, 0.025)
    shaper.curve = makeSoftClipCurve(1.1 + drive * 0.22)
    smooth(ctx, post.gain, 0.78 / Math.pow(drive, 0.34), 0.025)
    smooth(ctx, tone.frequency, clamp(getParam(effect.type, params, 'tone'), 500, 16000), 0.03)
    mix.setMix(getParam(effect.type, params, 'mix'))
  })
}

const createEq = (ctx: Ctx, effect: EffectInstance): EffectGraph => {
  const input = ctx.createGain()
  const low = ctx.createBiquadFilter()
  low.type = 'lowshelf'
  low.frequency.value = 220
  const mid = ctx.createBiquadFilter()
  mid.type = 'peaking'
  mid.frequency.value = 1000
  mid.Q.value = 0.9
  const high = ctx.createBiquadFilter()
  high.type = 'highshelf'
  high.frequency.value = 4800
  const output = ctx.createGain()
  input.connect(low)
  low.connect(mid)
  mid.connect(high)
  high.connect(output)
  return finish(ctx, effect, input, output, [low, mid, high], [], (params) => {
    smooth(ctx, low.gain, clamp(getParam(effect.type, params, 'low'), -12, 12))
    smooth(ctx, mid.gain, clamp(getParam(effect.type, params, 'mid'), -12, 12))
    smooth(ctx, high.gain, clamp(getParam(effect.type, params, 'high'), -12, 12))
  })
}

const createChorus = (ctx: Ctx, effect: EffectInstance): EffectGraph => {
  const mix = createWetDry(ctx)
  const delay = ctx.createDelay(0.1)
  delay.delayTime.value = 0.018
  const depth = ctx.createGain()
  const lfo = ctx.createOscillator()
  lfo.type = 'sine'
  lfo.connect(depth)
  depth.connect(delay.delayTime)
  lfo.start(0)
  mix.input.connect(delay)
  delay.connect(mix.wet)
  return finish(ctx, effect, mix.input, mix.output, [mix.dry, mix.wet, delay, depth], [lfo], (params) => {
    smooth(ctx, lfo.frequency, clamp(getParam(effect.type, params, 'rate'), 0.03, 8), 0.03)
    smooth(ctx, depth.gain, clamp(getParam(effect.type, params, 'depth'), 0, 1) * 0.008, 0.03)
    mix.setMix(getParam(effect.type, params, 'mix'))
  })
}

const createPhaser = (ctx: Ctx, effect: EffectInstance): EffectGraph => {
  const mix = createWetDry(ctx)
  const filters = [400, 800, 1600, 3200].map((frequency) => {
    const filter = ctx.createBiquadFilter()
    filter.type = 'allpass'
    filter.frequency.value = frequency
    filter.Q.value = 1.1
    return filter
  })
  const depth = ctx.createGain()
  const lfo = ctx.createOscillator()
  lfo.type = 'sine'
  lfo.connect(depth)
  for (const filter of filters) depth.connect(filter.frequency)
  lfo.start(0)
  mix.input.connect(filters[0])
  for (let index = 0; index < filters.length - 1; index++) {
    filters[index].connect(filters[index + 1])
  }
  filters[filters.length - 1].connect(mix.wet)
  return finish(
    ctx,
    effect,
    mix.input,
    mix.output,
    [mix.dry, mix.wet, ...filters, depth],
    [lfo],
    (params) => {
      smooth(ctx, lfo.frequency, clamp(getParam(effect.type, params, 'rate'), 0.03, 8), 0.03)
      smooth(ctx, depth.gain, clamp(getParam(effect.type, params, 'depth'), 0, 1) * 300, 0.03)
      mix.setMix(getParam(effect.type, params, 'mix'))
    },
  )
}

const createTremolo = (ctx: Ctx, effect: EffectInstance): EffectGraph => {
  const input = ctx.createGain()
  const amp = ctx.createGain()
  const output = ctx.createGain()
  const depth = ctx.createGain()
  const lfo = ctx.createOscillator()
  lfo.type = 'sine'
  lfo.connect(depth)
  depth.connect(amp.gain)
  lfo.start(0)
  input.connect(amp)
  amp.connect(output)
  return finish(ctx, effect, input, output, [amp, depth], [lfo], (params) => {
    const amount = clamp(getParam(effect.type, params, 'depth'), 0, 1)
    smooth(ctx, lfo.frequency, clamp(getParam(effect.type, params, 'rate'), 0.05, 16), 0.03)
    smooth(ctx, depth.gain, amount * 0.5, 0.03)
    smooth(ctx, amp.gain, 1 - amount * 0.5, 0.03)
  })
}

const createAutoPan = (ctx: Ctx, effect: EffectInstance): EffectGraph => {
  const input = ctx.createGain()
  const panner = ctx.createStereoPanner()
  const output = ctx.createGain()
  const depth = ctx.createGain()
  const lfo = ctx.createOscillator()
  lfo.type = 'sine'
  lfo.connect(depth)
  depth.connect(panner.pan)
  lfo.start(0)
  input.connect(panner)
  panner.connect(output)
  return finish(ctx, effect, input, output, [panner, depth], [lfo], (params) => {
    smooth(ctx, lfo.frequency, clamp(getParam(effect.type, params, 'rate'), 0.03, 8), 0.03)
    smooth(ctx, depth.gain, clamp(getParam(effect.type, params, 'depth'), 0, 1), 0.03)
  })
}

const createDelay = (ctx: Ctx, effect: EffectInstance): EffectGraph => {
  const mix = createWetDry(ctx)
  const delay = ctx.createDelay(2)
  const tone = ctx.createBiquadFilter()
  tone.type = 'lowpass'
  const feedback = ctx.createGain()
  mix.input.connect(delay)
  delay.connect(tone)
  tone.connect(mix.wet)
  tone.connect(feedback)
  feedback.connect(delay)
  delay.delayTime.value = 0.28
  feedback.gain.value = 0
  return finish(ctx, effect, mix.input, mix.output, [mix.dry, mix.wet, delay, tone, feedback], [], (params) => {
    smooth(ctx, delay.delayTime, clamp(getParam(effect.type, params, 'time'), 0.03, 1.8), 0.04)
    smooth(ctx, feedback.gain, clamp(getParam(effect.type, params, 'feedback'), 0, 0.85), 0.03)
    smooth(ctx, tone.frequency, clamp(getParam(effect.type, params, 'tone'), 400, 14000), 0.03)
    mix.setMix(getParam(effect.type, params, 'mix'))
  })
}

const createReverb = (ctx: Ctx, effect: EffectInstance): EffectGraph => {
  const mix = createWetDry(ctx)
  const convolver = ctx.createConvolver()
  convolver.normalize = true
  convolver.buffer = createReverbImpulse(ctx, 2.2)
  const tone = ctx.createBiquadFilter()
  tone.type = 'lowpass'
  mix.input.connect(convolver)
  convolver.connect(tone)
  tone.connect(mix.wet)
  return finish(ctx, effect, mix.input, mix.output, [mix.dry, mix.wet, convolver, tone], [], (params) => {
    smooth(ctx, tone.frequency, clamp(getParam(effect.type, params, 'tone'), 800, 16000), 0.03)
    mix.setMix(getParam(effect.type, params, 'mix'))
  })
}

const createCompressor = (ctx: Ctx, effect: EffectInstance): EffectGraph => {
  const input = ctx.createGain()
  const compressor = ctx.createDynamicsCompressor()
  compressor.knee.value = 12
  compressor.attack.value = 0.01
  compressor.release.value = 0.24
  const makeup = ctx.createGain()
  const output = ctx.createGain()
  input.connect(compressor)
  compressor.connect(makeup)
  makeup.connect(output)
  return finish(ctx, effect, input, output, [compressor, makeup], [], (params) => {
    smooth(ctx, compressor.threshold, clamp(getParam(effect.type, params, 'threshold'), -60, 0), 0.03)
    smooth(ctx, compressor.ratio, clamp(getParam(effect.type, params, 'ratio'), 1, 20), 0.03)
    smooth(ctx, makeup.gain, clamp(getParam(effect.type, params, 'makeup'), 0.5, 2.5), 0.03)
  })
}

const createBitcrush = (ctx: Ctx, effect: EffectInstance): EffectGraph => {
  const mix = createWetDry(ctx)
  const shaper = ctx.createWaveShaper()
  const tone = ctx.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.value = 9200
  mix.input.connect(shaper)
  shaper.connect(tone)
  tone.connect(mix.wet)
  const curveFor = (bits: number) => {
    const levels = Math.pow(2, Math.round(clamp(bits, 2, 16)))
    const curve = new Float32Array(4096)
    for (let index = 0; index < curve.length; index++) {
      const x = (index / (curve.length - 1)) * 2 - 1
      curve[index] = Math.round(x * levels) / levels
    }
    return curve
  }
  return finish(ctx, effect, mix.input, mix.output, [mix.dry, mix.wet, shaper, tone], [], (params) => {
    shaper.curve = curveFor(getParam(effect.type, params, 'bits'))
    mix.setMix(getParam(effect.type, params, 'mix'))
  })
}

export const createEffectGraph = (ctx: Ctx, effect: EffectInstance): EffectGraph => {
  switch (effect.type) {
    case 'filter':
      return createFilter(ctx, effect)
    case 'drive':
      return createDrive(ctx, effect)
    case 'eq':
      return createEq(ctx, effect)
    case 'chorus':
      return createChorus(ctx, effect)
    case 'phaser':
      return createPhaser(ctx, effect)
    case 'tremolo':
      return createTremolo(ctx, effect)
    case 'autopan':
      return createAutoPan(ctx, effect)
    case 'delay':
      return createDelay(ctx, effect)
    case 'reverb':
      return createReverb(ctx, effect)
    case 'compressor':
      return createCompressor(ctx, effect)
    case 'bitcrush':
      return createBitcrush(ctx, effect)
  }
}

export const createEffectChain = (ctx: Ctx): EffectChain => {
  const input = ctx.createGain()
  const output = ctx.createGain()
  let graphs: EffectGraph[] = []
  let signature = ''

  const connect = () => {
    try {
      input.disconnect()
    } catch {
      /* noop */
    }
    for (const graph of graphs) {
      try {
        graph.output.disconnect()
      } catch {
        /* noop */
      }
    }
    let previous: AudioNode = input
    for (const graph of graphs) {
      previous.connect(graph.input)
      previous = graph.output
    }
    previous.connect(output)
  }

  const setEffects = (effects: EffectInstance[]) => {
    const active = effects.filter((effect) => effect.enabled)
    const nextSignature = active.map((effect) => `${effect.id}:${effect.type}`).join('|')
    if (nextSignature === signature) {
      active.forEach((effect, index) => graphs[index]?.setParams(effect.params))
      return
    }
    for (const graph of graphs) graph.dispose()
    graphs = active.map((effect) => createEffectGraph(ctx, effect))
    signature = nextSignature
    connect()
  }

  connect()
  return { input, output, setEffects }
}
