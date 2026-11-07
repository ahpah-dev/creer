import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Cable, LayoutGrid, Minus, Plus } from 'lucide-react'
import { DRUM_NOTES, INSTRUMENT_MAP, isDrumInstrument } from '../data/instruments'
import { engine } from '../audio/engine'
import { useProjectStore } from '../store/project'
import { useSessionStore } from '../store/session'
import { useMidiStore } from '../store/midi'
import { captureNoteEnd, captureNoteStart } from '../lib/recording'
import { clamp, isBlackKey, isTypingTarget, midiToName } from '../lib/utils'
import { TrackIcon } from './TrackIcon'
import { VoiceControls } from './VoiceControls'

const COMPUTER_KEYS: Record<string, number> = {
  KeyA: 0,
  KeyW: 1,
  KeyS: 2,
  KeyE: 3,
  KeyD: 4,
  KeyF: 5,
  KeyT: 6,
  KeyG: 7,
  KeyY: 8,
  KeyH: 9,
  KeyU: 10,
  KeyJ: 11,
  KeyK: 12,
}

const KEY_LABELS: Record<number, string> = {
  0: 'A',
  1: 'W',
  2: 'S',
  3: 'E',
  4: 'D',
  5: 'F',
  6: 'T',
  7: 'G',
  8: 'Y',
  9: 'H',
  10: 'U',
  11: 'J',
  12: 'K',
}

const PAD_KEYS = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K']
const PAD_KEY_CODES: Record<string, number> = {
  KeyA: 0,
  KeyS: 1,
  KeyD: 2,
  KeyF: 3,
  KeyG: 4,
  KeyH: 5,
  KeyJ: 6,
  KeyK: 7,
}

interface ActiveEntry {
  pitch: number
  voiceKey: string | null
  recordToken: string | null
  cancelled: boolean
}

export function KeyboardPanel() {
  const project = useProjectStore((state) => state.project)
  const selectedTrackId = useProjectStore((state) => state.selectedTrackId)
  const track = project.tracks.find((item) => item.id === selectedTrackId) ?? project.tracks[0]
  const octave = useSessionStore((state) => state.keyboardOctave)
  const setOctave = useSessionStore((state) => state.setKeyboardOctave)
  const isRecording = useSessionStore((state) => state.isRecording)
  const setModal = useSessionStore((state) => state.setModal)
  const midiStatus = useMidiStore((state) => state.status)
  const midiDevices = useMidiStore((state) => state.devices)
  const midiActiveNotes = useMidiStore((state) => state.activeNotes)
  const midiNotes = new Set(midiActiveNotes)
  const activeSources = useRef(new Map<string, ActiveEntry>())
  const [activePitches, setActivePitches] = useState<Set<number>>(new Set())
  const [activePad, setActivePad] = useState<number | null>(null)
  const padTimers = useRef<number[]>([])
  const isDrums = Boolean(track && isDrumInstrument(track.instrument))
  const basePitch = (octave + 1) * 12
  const visiblePitches = Array.from({ length: 25 }, (_, index) => basePitch + index)
  const whitePitches = visiblePitches.filter((pitch) => !isBlackKey(pitch))
  const whiteWidth = 100 / Math.max(1, whitePitches.length)
  const blackKeys = visiblePitches
    .filter((pitch) => isBlackKey(pitch))
    .map((pitch) => {
      const whitesBefore = visiblePitches.filter((item) => item < pitch && !isBlackKey(item)).length
      return {
        pitch,
        left: whitesBefore * whiteWidth - whiteWidth * 0.3,
        width: whiteWidth * 0.6,
      }
    })

  const refreshActive = useCallback(() => {
    setActivePitches(new Set([...activeSources.current.values()].map((entry) => entry.pitch)))
  }, [])

  const releaseSource = useCallback((source: string) => {
    const entry = activeSources.current.get(source)
    if (!entry) return
    entry.cancelled = true
    activeSources.current.delete(source)
    if (entry.voiceKey) engine.noteOff(entry.voiceKey)
    captureNoteEnd(entry.recordToken)
    refreshActive()
  }, [refreshActive])

  const startNote = useCallback((source: string, pitch: number, velocity: number) => {
    if (!track || activeSources.current.has(source)) return
    const recordToken = captureNoteStart(pitch, velocity)
    const entry: ActiveEntry = {
      pitch,
      voiceKey: null,
      recordToken,
      cancelled: false,
    }
    activeSources.current.set(source, entry)
    refreshActive()
    void engine.noteOn(track.instrument, track.id, pitch, velocity).then((key) => {
      if (!key) return
      if (entry.cancelled || !activeSources.current.has(source)) {
        engine.noteOff(key)
      } else {
        entry.voiceKey = key
      }
    })
  }, [refreshActive, track])

  // Release pointer notes on pointer up and clean up any sounding notes when the
  // octave, track, or instrument changes.
  useEffect(() => {
    const releasePointer = (event: PointerEvent) => {
      releaseSource(`pointer:${event.pointerId}`)
    }
    const releaseAll = () => {
      for (const source of [...activeSources.current.keys()]) releaseSource(source)
    }
    window.addEventListener('pointerup', releasePointer)
    window.addEventListener('pointercancel', releasePointer)
    window.addEventListener('blur', releaseAll)
    return () => {
      window.removeEventListener('pointerup', releasePointer)
      window.removeEventListener('pointercancel', releasePointer)
      window.removeEventListener('blur', releaseAll)
      releaseAll()
    }
  }, [releaseSource, octave, track?.id, track?.instrument])

  const hitPad = useCallback((pitch: number) => {
    if (!track) return
    setActivePad(pitch)
    const timer = window.setTimeout(() => setActivePad(null), 150)
    padTimers.current.push(timer)
    const recordToken = captureNoteStart(pitch, 0.85)
    void engine.noteOn(track.instrument, track.id, pitch, 0.85).then((key) => {
      window.setTimeout(() => engine.noteOff(key), 500)
      if (recordToken) window.setTimeout(() => captureNoteEnd(recordToken), 130)
    })
  }, [track])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
      if (isTypingTarget(event.target) || useSessionStore.getState().modal) return
      if (!track) return
      if (isDrums) {
        const padIndex = PAD_KEY_CODES[event.code]
        if (padIndex !== undefined) {
          event.preventDefault()
          const drum = DRUM_NOTES[padIndex]
          if (drum) hitPad(drum.pitch)
        }
        return
      }
      if (event.code === 'KeyZ' || event.code === 'KeyX') {
        event.preventDefault()
        setOctave(octave + (event.code === 'KeyZ' ? -1 : 1))
        return
      }
      const offset = COMPUTER_KEYS[event.code]
      if (offset !== undefined) {
        event.preventDefault()
        startNote(`key:${event.code}`, basePitch + offset, 0.82)
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (COMPUTER_KEYS[event.code] !== undefined) {
        releaseSource(`key:${event.code}`)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [basePitch, hitPad, isDrums, octave, releaseSource, setOctave, startNote, track])

  useEffect(() => {
    return () => {
      padTimers.current.forEach((timer) => window.clearTimeout(timer))
    }
  }, [])

  if (!track) {
    return <div className="keyboard-empty">Add a track to start playing.</div>
  }

  const triggerPointer = (event: ReactPointerEvent<HTMLButtonElement>, pitch: number) => {
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    const velocity = clamp(0.55 + ((event.clientY - rect.top) / rect.height) * 0.4, 0.4, 0.98)
    startNote(`pointer:${event.pointerId}`, pitch, velocity)
  }

  return (
    <div className={`keyboard-panel ${isDrums ? 'is-drum-panel' : ''}`} style={{ '--track-color': track.color } as CSSProperties}>
      <div className="keyboard-toolbar">
        <button
          className="sound-browser-button"
          onClick={() => setModal('sounds')}
          aria-label="Browse instrument library"
          data-tip="Browse the instrument library"
        >
          <span className="keyboard-sound-icon">
            <TrackIcon instrument={track.instrument} size={15} />
          </span>
          <span className="sound-browser-copy">
            <span className="eyebrow">SOUND</span>
            <strong>{INSTRUMENT_MAP[track.instrument].name}</strong>
          </span>
          <span className="sound-browser-action">
            <LayoutGrid size={10} />
            Browse
          </span>
        </button>
        <div className="keyboard-track-meta">
          {track.name !== INSTRUMENT_MAP[track.instrument].name && (
            <>
              <span>{track.name}</span>
              <span className="keyboard-meta-divider" />
            </>
          )}
          <span>
            {isDrums
              ? '12 pads'
              : `Live keys · ${midiToName(basePitch)} – ${midiToName(basePitch + 24)}`}
          </span>
        </div>
        {!isDrums && (
          <div className="octave-control">
            <span className="eyebrow">OCTAVE</span>
            <button onClick={() => setOctave(octave - 1)} disabled={octave <= 1} aria-label="Octave down">
              <Minus size={12} />
            </button>
            <strong>{octave}</strong>
            <button onClick={() => setOctave(octave + 1)} disabled={octave >= 5} aria-label="Octave up">
              <Plus size={12} />
            </button>
          </div>
        )}
        {midiStatus === 'ready' && (
          <span
            className={`keyboard-midi-chip ${midiActiveNotes.length ? 'is-live' : ''}`}
            title={
              midiDevices.length
                ? `MIDI connected: ${midiDevices[0].name}`
                : 'MIDI enabled, no device selected'
            }
          >
            <Cable size={11} />
            <i />
            MIDI
          </span>
        )}
        <div className="keyboard-hints">
          {isDrums ? (
            <>
              <span>Play the pads</span>
              <kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><kbd>F</kbd>
            </>
          ) : (
            <>
              <span>Musical typing</span>
              <kbd>A</kbd><span>–</span><kbd>K</kbd>
              <span className="hint-sep">·</span>
              <kbd>Z</kbd><kbd>X</kbd><span>octave</span>
            </>
          )}
        </div>
        {isRecording && (
          <span className="recording-badge">
            <i />
            RECORDING
          </span>
        )}
      </div>

      <div className="keyboard-body">
        <VoiceControls track={track} />

        <div className="keyboard-performance">
          {isDrums ? (
            <div className="drum-pads">
              {DRUM_NOTES.map((drum, index) => (
                <button
                  key={drum.pitch}
                  className={`drum-pad ${activePad === drum.pitch || midiNotes.has(drum.pitch) ? 'is-hit' : ''}`}
                  onPointerDown={(event) => {
                    event.preventDefault()
                    hitPad(drum.pitch)
                  }}
                  aria-label={`Play ${drum.name}`}
                >
                  <span className="pad-shortcut">{PAD_KEYS[index] ?? ''}</span>
                  <span className="pad-name">{drum.name}</span>
                  <span className="pad-glow" aria-hidden="true" />
                </button>
              ))}
            </div>
          ) : (
            <div className="keyboard-stage">
              <div className="piano-keyboard" role="group" aria-label="Playable piano keyboard">
                <div className="white-keys">
                  {whitePitches.map((pitch) => {
                    const offset = pitch - basePitch
                    const label = KEY_LABELS[offset]
                    return (
                      <button
                        key={pitch}
                        className={`piano-key white ${activePitches.has(pitch) || midiNotes.has(pitch) ? 'is-active' : ''}`}
                        onPointerDown={(event) => triggerPointer(event, pitch)}
                        aria-label={`Play ${midiToName(pitch)}`}
                        tabIndex={-1}
                      >
                        <span className="white-key-label">
                          {pitch % 12 === 0 ? <em>{midiToName(pitch)}</em> : null}
                          {label && <kbd>{label}</kbd>}
                        </span>
                      </button>
                    )
                  })}
                </div>
                {blackKeys.map(({ pitch, left, width }) => {
                  const offset = pitch - basePitch
                  const label = KEY_LABELS[offset]
                  return (
                    <button
                      key={pitch}
                      className={`piano-key black ${activePitches.has(pitch) || midiNotes.has(pitch) ? 'is-active' : ''}`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                      onPointerDown={(event) => triggerPointer(event, pitch)}
                      aria-label={`Play ${midiToName(pitch)}`}
                      tabIndex={-1}
                    >
                      <span className="black-key-label">{label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
