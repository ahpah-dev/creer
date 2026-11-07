import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { ChevronLeft, ChevronRight, LayoutGrid, Plus } from 'lucide-react'
import { engine } from '../audio/engine'
import { DRUM_NOTES, INSTRUMENT_MAP, isDrumInstrument } from '../data/instruments'
import { useProjectStore } from '../store/project'
import { useSessionStore } from '../store/session'
import { captureNoteEnd, captureNoteStart } from '../lib/recording'
import { clamp, FLAT_NAMES, isBlackKey, keyPitchClass, midiToName, NOTE_NAMES } from '../lib/utils'
import type { Track } from '../types'
import { TrackIcon } from '../components/TrackIcon'
import { useMobileStore } from './store'
import { Segmented } from './ui'

interface Held {
  pitch: number
  voiceKey: string | null
  token: string | null
  cancelled: boolean
}

/**
 * Multi-touch note playing with live recording capture. Each source (a finger,
 * a chord pad) can hold several pitches and releases them together.
 */
function useNotePlayer(track: Track | undefined) {
  const held = useRef(new Map<string, Held[]>())
  const [active, setActive] = useState<Set<number>>(new Set())

  const refresh = useCallback(() => {
    const next = new Set<number>()
    for (const list of held.current.values()) for (const entry of list) next.add(entry.pitch)
    setActive(next)
  }, [])

  const release = useCallback(
    (source: string) => {
      const list = held.current.get(source)
      if (!list) return
      held.current.delete(source)
      for (const entry of list) {
        entry.cancelled = true
        if (entry.voiceKey) engine.noteOff(entry.voiceKey)
        captureNoteEnd(entry.token)
      }
      refresh()
    },
    [refresh],
  )

  const releaseAll = useCallback(() => {
    for (const source of [...held.current.keys()]) release(source)
  }, [release])

  const start = useCallback(
    (source: string, pitches: number[], velocity: number) => {
      if (!track || held.current.has(source)) return
      const list: Held[] = pitches.map((pitch, index) => ({
        pitch,
        voiceKey: null,
        token: captureNoteStart(pitch, index === 0 && pitches.length > 3 ? velocity * 0.8 : velocity),
        cancelled: false,
      }))
      held.current.set(source, list)
      refresh()
      list.forEach((entry, index) => {
        void engine
          .noteOn(track.instrument, track.id, entry.pitch, index === 0 && pitches.length > 3 ? velocity * 0.8 : velocity)
          .then((key) => {
            if (!key) return
            if (entry.cancelled) engine.noteOff(key)
            else entry.voiceKey = key
          })
      })
    },
    [refresh, track],
  )

  // Cut everything when the track or sound changes, or the page goes away.
  useEffect(() => {
    const stop = () => releaseAll()
    window.addEventListener('blur', stop)
    document.addEventListener('visibilitychange', stop)
    return () => {
      window.removeEventListener('blur', stop)
      document.removeEventListener('visibilitychange', stop)
      releaseAll()
    }
  }, [releaseAll, track?.id, track?.instrument])

  return { active, start, release, releaseAll, held }
}

function Keyboard({ track, basePitch }: { track: Track; basePitch: number }) {
  const project = useProjectStore((state) => state.project)
  const player = useNotePlayer(track)
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(360)
  const pointers = useRef(new Map<number, number>())

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(() => setWidth(element.clientWidth))
    observer.observe(element)
    setWidth(element.clientWidth)
    return () => observer.disconnect()
  }, [])

  const whiteCount = clamp(Math.round(width / 46), 7, 17)
  const whites = useMemo(() => {
    const list: number[] = []
    for (let pitch = basePitch; list.length < whiteCount; pitch++) if (!isBlackKey(pitch)) list.push(pitch)
    return list
  }, [basePitch, whiteCount])
  const blacks = useMemo(
    () => whites.slice(1).flatMap((pitch, index) => (pitch - whites[index] === 2 ? [{ pitch: pitch - 1, boundary: index + 1 }] : [])),
    [whites],
  )
  const keyPc = keyPitchClass(project.key)
  const scale = project.scale === 'minor' ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11]
  const inKey = (pitch: number) => scale.includes((((pitch - keyPc) % 12) + 12) % 12)
  const isRoot = (pitch: number) => (((pitch - keyPc) % 12) + 12) % 12 === 0

  const pitchAt = (clientX: number, clientY: number) => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return null
    const x = clamp((clientX - rect.left) / rect.width, 0, 0.9999) * whiteCount
    const y = clamp((clientY - rect.top) / rect.height, 0, 1)
    if (y < 0.62) {
      for (const black of blacks) {
        if (Math.abs(x - black.boundary) < 0.32) return { pitch: black.pitch, velocity: clamp(0.5 + (y / 0.62) * 0.4, 0.4, 0.95) }
      }
    }
    return { pitch: whites[Math.floor(x)], velocity: clamp(0.45 + y * 0.5, 0.4, 0.98) }
  }

  const down = (event: React.PointerEvent) => {
    event.preventDefault()
    ref.current?.setPointerCapture(event.pointerId)
    const hit = pitchAt(event.clientX, event.clientY)
    if (!hit) return
    pointers.current.set(event.pointerId, hit.pitch)
    player.start(`p${event.pointerId}`, [hit.pitch], hit.velocity)
  }
  const move = (event: React.PointerEvent) => {
    const current = pointers.current.get(event.pointerId)
    if (current === undefined) return
    const hit = pitchAt(event.clientX, event.clientY)
    if (!hit || hit.pitch === current) return
    player.release(`p${event.pointerId}`)
    pointers.current.set(event.pointerId, hit.pitch)
    player.start(`p${event.pointerId}`, [hit.pitch], hit.velocity)
  }
  const up = (event: React.PointerEvent) => {
    pointers.current.delete(event.pointerId)
    player.release(`p${event.pointerId}`)
  }

  return (
    <div
      className="m-keyboard"
      ref={ref}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onContextMenu={(event) => event.preventDefault()}
      role="group"
      aria-label="Playable piano keyboard"
      style={{ '--track-color': track.color } as CSSProperties}
    >
      <div className="m-whites">
        {whites.map((pitch) => (
          <div key={pitch} className={`m-white ${player.active.has(pitch) ? 'is-down' : ''} ${inKey(pitch) ? 'in-key' : ''}`}>
            {isRoot(pitch) && <i className="m-root-dot" />}
            {pitch % 12 === 0 && <span>{midiToName(pitch)}</span>}
          </div>
        ))}
      </div>
      {blacks.map((black) => (
        <div
          key={black.pitch}
          className={`m-black ${player.active.has(black.pitch) ? 'is-down' : ''} ${inKey(black.pitch) ? 'in-key' : ''}`}
          style={{ left: `${(black.boundary / whiteCount) * 100}%`, width: `${(0.62 / whiteCount) * 100}%` }}
        >
          {isRoot(black.pitch) && <i className="m-root-dot" />}
        </div>
      ))}
    </div>
  )
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']

function ChordPads({ track, basePitch }: { track: Track; basePitch: number }) {
  const project = useProjectStore((state) => state.project)
  const player = useNotePlayer(track)
  const keyPc = keyPitchClass(project.key)
  const scale = project.scale === 'minor' ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11]
  const flats = /♭|b/.test(project.key) || ['F'].includes(project.key)
  const names = flats ? FLAT_NAMES : NOTE_NAMES

  const chords = useMemo(() => {
    // Tonic sits in the octave that contains the keyboard's base pitch, a touch above it.
    const tonic = basePitch + 12 + ((keyPc - (basePitch % 12) + 12) % 12)
    const degreePitch = (degree: number) => tonic + scale[degree % 7] + Math.floor(degree / 7) * 12
    return Array.from({ length: 8 }, (_, slot) => {
      const degree = slot % 7
      const octaveUp = slot === 7
      const root = degreePitch(degree) + (octaveUp ? 12 : 0)
      const third = degreePitch(degree + 2) + (octaveUp ? 12 : 0)
      const fifth = degreePitch(degree + 4) + (octaveUp ? 12 : 0)
      const thirdSteps = third - root
      const fifthSteps = fifth - root
      const minor = thirdSteps === 3
      const dim = minor && fifthSteps === 6
      const aug = !minor && fifthSteps === 8
      const rootName = names[root % 12]
      const label = `${rootName}${dim ? '°' : minor ? 'm' : aug ? '+' : ''}`
      const roman = ROMAN[degree]
      return {
        slot,
        label,
        roman: minor ? roman.toLowerCase() + (dim ? '°' : '') : roman + (aug ? '+' : ''),
        pitches: [Math.max(24, root - 12), root, third, fifth],
      }
    })
  }, [basePitch, keyPc, names, scale])

  return (
    <div className="m-chords" style={{ '--track-color': track.color } as CSSProperties}>
      {chords.map((chord) => {
        const down = chord.pitches.slice(1).every((pitch) => player.active.has(pitch))
        return (
          <button
            key={chord.slot}
            className={`m-chord ${down ? 'is-down' : ''}`}
            onPointerDown={(event) => {
              event.preventDefault()
              event.currentTarget.setPointerCapture(event.pointerId)
              player.start(`c${event.pointerId}`, chord.pitches, 0.78)
            }}
            onPointerUp={(event) => player.release(`c${event.pointerId}`)}
            onPointerCancel={(event) => player.release(`c${event.pointerId}`)}
            onContextMenu={(event) => event.preventDefault()}
            aria-label={`Chord ${chord.label}`}
          >
            <strong>{chord.label}</strong>
            <small>{chord.roman}</small>
          </button>
        )
      })}
    </div>
  )
}

function Pads({ track }: { track: Track }) {
  const [hits, setHits] = useState<Set<number>>(new Set())
  const timers = useRef<number[]>([])

  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), [])

  const hit = (pitch: number, velocity: number) => {
    setHits((current) => new Set(current).add(pitch))
    timers.current.push(
      window.setTimeout(() => {
        setHits((current) => {
          const next = new Set(current)
          next.delete(pitch)
          return next
        })
      }, 140),
    )
    const token = captureNoteStart(pitch, velocity)
    void engine.noteOn(track.instrument, track.id, pitch, velocity).then((key) => {
      window.setTimeout(() => engine.noteOff(key), 600)
      if (token) window.setTimeout(() => captureNoteEnd(token), 130)
    })
  }

  return (
    <div className="m-pads" style={{ '--track-color': track.color } as CSSProperties}>
      {DRUM_NOTES.map((drum) => (
        <button
          key={drum.pitch}
          className={`m-pad ${hits.has(drum.pitch) ? 'is-hit' : ''}`}
          onPointerDown={(event) => {
            event.preventDefault()
            const rect = event.currentTarget.getBoundingClientRect()
            hit(drum.pitch, clamp(0.62 + ((event.clientY - rect.top) / rect.height) * 0.36, 0.5, 0.98))
          }}
          onContextMenu={(event) => event.preventDefault()}
          aria-label={`Play ${drum.name}`}
        >
          <span>{drum.name}</span>
        </button>
      ))}
    </div>
  )
}

export function PlayView() {
  const project = useProjectStore((state) => state.project)
  const selectedTrackId = useProjectStore((state) => state.selectedTrackId)
  const selectTrack = useProjectStore((state) => state.selectTrack)
  const octave = useSessionStore((state) => state.keyboardOctave)
  const setOctave = useSessionStore((state) => state.setKeyboardOctave)
  const isRecording = useSessionStore((state) => state.isRecording)
  const playMode = useMobileStore((state) => state.playMode)
  const setPlayMode = useMobileStore((state) => state.setPlayMode)
  const setSoundPicker = useMobileStore((state) => state.setSoundPicker)
  const track = project.tracks.find((item) => item.id === selectedTrackId) ?? project.tracks[0]
  const chipsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chipsRef.current?.querySelector('.is-on')?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [selectedTrackId])

  if (!track) {
    return (
      <div className="m-empty">
        <h2>Nothing to play yet</h2>
        <p>Add a track and its keys or pads will appear here.</p>
        <button className="m-btn m-btn-primary" onClick={() => setSoundPicker('add')}>
          <Plus size={18} /> Add a track
        </button>
      </div>
    )
  }

  const drums = isDrumInstrument(track.instrument)
  const basePitch = (octave + 1) * 12
  const info = INSTRUMENT_MAP[track.instrument]

  return (
    <div className={`m-playview ${isRecording ? 'is-recording' : ''}`} style={{ '--c': track.color } as CSSProperties}>
      <div className="m-play-head">
        <div className="m-track-chips" ref={chipsRef} role="group" aria-label="Choose track">
          {project.tracks.map((item) => (
            <button
              key={item.id}
              className={item.id === track.id ? 'is-on' : ''}
              style={{ '--c': item.color } as CSSProperties}
              onClick={() => selectTrack(item.id)}
            >
              <TrackIcon instrument={item.instrument} size={14} />
              <span>{item.name}</span>
            </button>
          ))}
          <button className="m-chip-add" onClick={() => setSoundPicker('add')} aria-label="Add a track">
            <Plus size={16} />
          </button>
        </div>
        <div className="m-play-row">
          <button className="m-sound-btn" onClick={() => setSoundPicker('assign')}>
            <span className="m-sound-btn-icon">
              <TrackIcon instrument={track.instrument} size={17} />
            </span>
            <span>
              <small>SOUND</small>
              <b>{info.name}</b>
            </span>
            <LayoutGrid size={15} />
          </button>
          {!drums && (
            <Segmented
              label="Play mode"
              value={playMode}
              options={[
                { value: 'keys', label: 'Keys' },
                { value: 'chords', label: 'Chords' },
              ]}
              onChange={setPlayMode}
            />
          )}
          {!drums && playMode === 'keys' && (
            <div className="m-octave" role="group" aria-label="Octave">
              <button onClick={() => setOctave(octave - 1)} disabled={octave <= 1} aria-label="Octave down">
                <ChevronLeft size={18} />
              </button>
              <span>
                <small>OCT</small>
                <b>{octave}</b>
              </span>
              <button onClick={() => setOctave(octave + 1)} disabled={octave >= 5} aria-label="Octave up">
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="m-play-body">
        {isRecording && (
          <div className="m-rec-banner">
            <i /> Recording to {track.name}
          </div>
        )}
        {drums ? <Pads track={track} /> : playMode === 'keys' ? <Keyboard track={track} basePitch={basePitch} /> : <ChordPads track={track} basePitch={basePitch} />}
      </div>
    </div>
  )
}
