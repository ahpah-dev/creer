import type { InstrumentId, VoiceSettings } from '../types'
import { isDrumInstrument } from '../data/instruments'
import { triggerNote, type VoiceHandle } from './synth'

export const DEFAULT_VOICE: VoiceSettings = { octave: 0, attack: 0, tone: 0, dynamics: 1 }

export const resolveVoice = (voice?: Partial<VoiceSettings>): VoiceSettings => ({ ...DEFAULT_VOICE, ...voice })

export const isDefaultVoice = (voice?: Partial<VoiceSettings>) => {
  const resolved = resolveVoice(voice)
  return (
    resolved.octave === 0 &&
    resolved.attack < 0.004 &&
    Math.abs(resolved.tone) < 0.01 &&
    resolved.dynamics > 0.99
  )
}

/** The velocity every note collapses towards when dynamics are turned down. */
const FLAT_VELOCITY = 0.78

/**
 * Plays a note through a track's voice controls: octave transpose, velocity
 * response and an extra swell. Tone is applied on the track bus instead, so it
 * also colours notes that are already ringing.
 */
export const triggerShapedNote = (
  ctx: BaseAudioContext,
  destination: AudioNode,
  instrument: InstrumentId,
  settings: Partial<VoiceSettings> | undefined,
  pitch: number,
  when: number,
  duration: number,
  velocity: number,
): VoiceHandle => {
  const voice = resolveVoice(settings)
  const drums = isDrumInstrument(instrument)
  const shapedPitch = drums ? pitch : Math.max(0, Math.min(127, pitch + Math.round(voice.octave) * 12))
  const dynamics = Math.max(0, Math.min(1, voice.dynamics))
  const shapedVelocity = FLAT_VELOCITY + (velocity - FLAT_VELOCITY) * dynamics

  if (drums || voice.attack < 0.004) {
    return triggerNote(ctx, destination, instrument, shapedPitch, when, duration, shapedVelocity)
  }

  const swell = ctx.createGain()
  const attack = Math.min(1.5, voice.attack)
  // An equal-power style curve: quick to leave silence, gentle at the top.
  const curve = new Float32Array(24)
  for (let i = 0; i < curve.length; i++) curve[i] = Math.sin(((i / (curve.length - 1)) * Math.PI) / 2)
  swell.gain.setValueAtTime(0, when)
  swell.gain.setValueCurveAtTime(curve, when, attack)
  swell.connect(destination)
  const handle = triggerNote(ctx, swell, instrument, shapedPitch, when, duration, shapedVelocity)

  let cleaned = false
  const cleanupAfter = (seconds: number) => {
    if (cleaned || typeof window === 'undefined') return
    cleaned = true
    window.setTimeout(() => {
      try {
        swell.disconnect()
      } catch {
        /* noop */
      }
    }, Math.max(0, seconds * 1000))
  }
  if (handle.endsAt - when < 20) cleanupAfter(handle.endsAt - ctx.currentTime + 0.5)

  return {
    ...handle,
    stop: (at?: number) => {
      handle.stop(at)
      cleanupAfter(0.4)
    },
    release: (at?: number) => {
      if (handle.release) handle.release(at)
      else handle.stop(at)
      cleanupAfter(4)
    },
  }
}
