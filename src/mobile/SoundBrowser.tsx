import { useEffect, useState, type CSSProperties } from 'react'
import { Pause, Play, Plus, Search } from 'lucide-react'
import { INSTRUMENTS, INSTRUMENT_MAP, INSTRUMENT_GROUPS } from '../data/instruments'
import { getAuditionNotes } from '../lib/auditions'
import { engine } from '../audio/engine'
import { useProjectStore } from '../store/project'
import { useSessionStore } from '../store/session'
import { addTrackWithStarterClip } from '../lib/tracks'
import type { InstrumentId } from '../types'
import { TrackIcon } from '../components/TrackIcon'
import { useMobileStore } from './store'

const CATEGORIES = ['All', 'New', ...INSTRUMENT_GROUPS] as const

/**
 * The instrument library: tap a sound to hear it, then load it on the current
 * track or grow a new track from it.
 */
export function SoundBrowser({ allowAssign = true, onDone }: { allowAssign?: boolean; onDone?: () => void }) {
  const project = useProjectStore((state) => state.project)
  const selectedTrackId = useProjectStore((state) => state.selectedTrackId)
  const updateTrack = useProjectStore((state) => state.updateTrack)
  const toast = useSessionStore((state) => state.toast)
  const setTab = useMobileStore((state) => state.setTab)
  const track = project.tracks.find((item) => item.id === selectedTrackId) ?? project.tracks[0]
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('All')
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<InstrumentId | null>(null)
  const [playing, setPlaying] = useState<InstrumentId | null>(null)

  useEffect(() => () => engine.stopPreview(), [])

  const query = search.trim().toLowerCase()
  const sounds = INSTRUMENTS.filter((instrument) => {
    if (category === 'New' && !instrument.isNew) return false
    if (category !== 'All' && category !== 'New' && instrument.category !== category) return false
    if (!query) return true
    return `${instrument.name} ${instrument.category} ${instrument.description}`.toLowerCase().includes(query)
  })

  const choose = (id: InstrumentId) => {
    setPicked(id)
    if (playing === id) {
      engine.stopPreview()
      setPlaying(null)
      return
    }
    engine.stopPreview()
    setPlaying(id)
    void engine.previewNotes(id, getAuditionNotes(id), project.bpm, 4, () => {
      setPlaying((existing) => (existing === id ? null : existing))
    })
  }

  const current = picked ?? track?.instrument ?? null
  const pickedInfo = picked ? INSTRUMENT_MAP[picked] : null

  const assign = () => {
    if (!track || !picked) return
    engine.stopPreview()
    updateTrack(track.id, { instrument: picked })
    toast('Sound loaded', `${INSTRUMENT_MAP[picked].name} is now on ${track.name}.`, 'success')
    onDone?.()
  }

  const addNew = () => {
    if (!picked) return
    engine.stopPreview()
    addTrackWithStarterClip(picked)
    setTab('edit')
    onDone?.()
  }

  return (
    <div className="m-sounds">
      <div className="m-sounds-tools">
        <label className="m-search">
          <Search size={16} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search sounds"
            inputMode="search"
            enterKeyHint="search"
          />
        </label>
        <div className="m-chips" role="group" aria-label="Sound categories">
          {CATEGORIES.map((item) => (
            <button key={item} className={category === item ? 'is-on' : ''} onClick={() => setCategory(item)}>
              {item}
            </button>
          ))}
        </div>
      </div>
      <div className="m-sound-grid">
        {sounds.map((instrument) => (
          <button
            key={instrument.id}
            className={`m-sound ${current === instrument.id ? 'is-picked' : ''} ${track?.instrument === instrument.id ? 'is-current' : ''}`}
            style={{ '--c': instrument.color } as CSSProperties}
            onClick={() => choose(instrument.id)}
          >
            <span className="m-sound-icon">
              <TrackIcon instrument={instrument.id} size={18} />
            </span>
            <span className="m-sound-name">
              {instrument.name}
              {instrument.isNew && <em>NEW</em>}
            </span>
            <span className="m-sound-cat">{instrument.category}</span>
            <span className="m-sound-play" aria-hidden="true">
              {playing === instrument.id ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
            </span>
          </button>
        ))}
        {!sounds.length && <p className="m-empty-note">No sounds match “{search}”.</p>}
      </div>
      <div className="m-sounds-bar">
        <span className="m-sounds-picked">
          {pickedInfo ? (
            <>
              <b>{pickedInfo.name}</b>
              <small>{pickedInfo.description}</small>
            </>
          ) : (
            <small>Tap a sound to hear it.</small>
          )}
        </span>
        <div className="m-sounds-actions">
          {allowAssign && track && (
            <button className="m-btn m-btn-primary" onClick={assign} disabled={!picked || picked === track.instrument}>
              Use on {track.name.length > 14 ? `${track.name.slice(0, 13)}…` : track.name}
            </button>
          )}
          <button className="m-btn" onClick={addNew} disabled={!picked}>
            <Plus size={16} /> New track
          </button>
        </div>
      </div>
    </div>
  )
}
