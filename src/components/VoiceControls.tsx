import { Minus, Plus, RotateCcw } from 'lucide-react'
import type { Track, VoiceSettings } from '../types'
import { isDrumInstrument } from '../data/instruments'
import { isDefaultVoice, resolveVoice, DEFAULT_VOICE } from '../audio/voiceShaping'
import { useProjectStore } from '../store/project'
import { Knob } from './Mixer'

const formatAttack = (value: number) => (value < 0.005 ? 'Off' : value < 1 ? `${Math.round(value * 1000)}ms` : `${value.toFixed(2)}s`)
const formatTone = (value: number) =>
  Math.abs(value) < 0.02 ? 'Flat' : `${value < 0 ? 'Dark' : 'Bright'} ${Math.round(Math.abs(value) * 100)}`
const formatDynamics = (value: number) => `${Math.round(value * 100)}%`

/**
 * Per-track playing controls that sit in front of any instrument. They are
 * saved with the track and used for live playing, playback and WAV export.
 */
export function VoiceControls({ track }: { track: Track }) {
  const updateTrack = useProjectStore((state) => state.updateTrack)
  const voice = resolveVoice(track.voice)
  const drums = isDrumInstrument(track.instrument)
  const color = track.color

  const set = (patch: Partial<VoiceSettings>, key: string) =>
    updateTrack(track.id, { voice: { ...voice, ...patch } }, { coalesce: `voice-${key}:${track.id}` })

  return (
    <section className="voice-controls" aria-label="Voice controls">
      <header className="voice-controls-head">
        <span className="eyebrow">VOICE</span>
        <button
          className="voice-reset"
          onClick={() => updateTrack(track.id, { voice: { ...DEFAULT_VOICE } })}
          disabled={isDefaultVoice(track.voice)}
          aria-label="Reset voice controls"
          data-tip="Reset voice controls"
        >
          <RotateCcw size={11} />
        </button>
      </header>
      <div className="voice-controls-grid">
        {!drums && (
          <div className="voice-octave" role="group" aria-label="Track octave">
            <span className="voice-octave-value">
              {voice.octave > 0 ? `+${voice.octave}` : voice.octave}
            </span>
            <div className="voice-octave-buttons">
              <button
                onClick={() => set({ octave: Math.max(-2, voice.octave - 1) }, 'oct')}
                disabled={voice.octave <= -2}
                aria-label="Transpose track down an octave"
              >
                <Minus size={11} />
              </button>
              <button
                onClick={() => set({ octave: Math.min(2, voice.octave + 1) }, 'oct')}
                disabled={voice.octave >= 2}
                aria-label="Transpose track up an octave"
              >
                <Plus size={11} />
              </button>
            </div>
            <span className="knob-label">OCTAVE</span>
          </div>
        )}
        {!drums && (
          <Knob
            label="ATTACK"
            value={voice.attack}
            min={0}
            max={1.5}
            defaultValue={0}
            color={color}
            format={formatAttack}
            onChange={(value) => set({ attack: value < 0.01 ? 0 : value }, 'atk')}
          />
        )}
        <Knob
          label="TONE"
          value={voice.tone}
          min={-1}
          max={1}
          defaultValue={0}
          color={color}
          format={formatTone}
          onChange={(value) => set({ tone: Math.abs(value) < 0.03 ? 0 : value }, 'tone')}
        />
        <Knob
          label="DYNAMICS"
          value={voice.dynamics}
          min={0}
          max={1}
          defaultValue={1}
          color={color}
          format={formatDynamics}
          onChange={(value) => set({ dynamics: value }, 'dyn')}
        />
      </div>
    </section>
  )
}
