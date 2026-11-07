import { useRef, useState, type CSSProperties } from 'react'
import {
  Copy,
  Download,
  FilePlus2,
  FolderOpen,
  Loader2,
  Monitor,
  Music2,
  Piano,
  Save,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { engine } from '../audio/engine'
import { downloadBlob, renderProjectToWav, safeFilename } from '../audio/export'
import { INSTRUMENT_MAP, isDrumInstrument } from '../data/instruments'
import { DEFAULT_VOICE, resolveVoice } from '../audio/voiceShaping'
import { useProjectStore } from '../store/project'
import { useSessionStore } from '../store/session'
import { stopRecording } from '../lib/recording'
import { setUiPreference } from '../lib/device'
import { contentEnd, formatDuration, KEY_ROOTS, TRACK_COLORS, uid } from '../lib/utils'
import { TrackIcon } from '../components/TrackIcon'
import { useMobileStore } from './store'
import { Segmented, Sheet, Slider, Stepper } from './ui'
import { SoundBrowser } from './SoundBrowser'

const pct = (value: number) => `${Math.round(value * 100)}%`
const panLabel = (value: number) => (Math.abs(value) < 0.02 ? 'Center' : `${value < 0 ? 'L' : 'R'} ${Math.round(Math.abs(value) * 100)}`)

export function ProjectSheet() {
  const open = useMobileStore((state) => state.projectSheet)
  const setOpen = useMobileStore((state) => state.setProjectSheet)
  const project = useProjectStore((state) => state.project)
  const updateProject = useProjectStore((state) => state.updateProject)
  const replaceProject = useProjectStore((state) => state.replaceProject)
  const resetToDemo = useProjectStore((state) => state.resetToDemo)
  const newProject = useProjectStore((state) => state.newProject)
  const toast = useSessionStore((state) => state.toast)
  const fileRef = useRef<HTMLInputElement>(null)
  const [exporting, setExporting] = useState(false)
  const [confirm, setConfirm] = useState<'new' | 'demo' | null>(null)
  const setTab = useMobileStore((state) => state.setTab)

  const close = () => {
    setConfirm(null)
    setOpen(false)
  }

  const stopAll = () => {
    if (useSessionStore.getState().isRecording) stopRecording()
    engine.stop()
    const session = useSessionStore.getState()
    session.setPlaying(false)
    session.setPausedBeat(0)
    session.setSelectedNoteIds([])
    useMobileStore.getState().setSelectedNoteId(null)
  }

  const importProject = async (file: File) => {
    try {
      const data = JSON.parse(await file.text())
      stopAll()
      replaceProject(data, { clearHistory: true })
      toast('Project opened', `“${data.name ?? file.name}” is ready to play.`, 'success')
      setTab('tracks')
      close()
    } catch {
      toast('Could not open that file', 'Choose a Creer project (.json).', 'warn')
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  const saveCopy = () => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
    downloadBlob(blob, `${safeFilename(project.name)}.creer.json`)
    toast('Project saved', 'A .creer.json copy was downloaded.', 'success')
  }

  const exportWav = async () => {
    if (exporting) return
    if (!contentEnd(project)) {
      toast('Nothing to export yet', 'Add some notes first.', 'warn')
      return
    }
    setExporting(true)
    if (useSessionStore.getState().isRecording) stopRecording()
    engine.stop()
    useSessionStore.getState().setPlaying(false)
    try {
      const { blob, duration } = await renderProjectToWav(project)
      downloadBlob(blob, `${safeFilename(project.name)}.wav`)
      toast('Your mix is ready', `${safeFilename(project.name)}.wav · ${formatDuration(duration)}`, 'success')
    } catch (error) {
      console.error(error)
      toast('The export failed', 'Close other audio apps and try again.', 'warn')
    }
    setExporting(false)
  }

  const askOrRun = (kind: 'new' | 'demo') => {
    if (confirm !== kind) {
      setConfirm(kind)
      return
    }
    stopAll()
    if (kind === 'new') newProject()
    else resetToDemo()
    setConfirm(null)
    setTab('tracks')
    close()
    toast(kind === 'new' ? 'Fresh project' : 'Demo loaded', kind === 'new' ? 'A blank canvas. Add a track to begin.' : 'Golden Hour is ready to play.')
  }

  return (
    <Sheet open={open} onClose={close} eyebrow="PROJECT" title={project.name || 'Untitled Song'} size="tall">
      <input
        ref={fileRef}
        type="file"
        accept=".json,.creer,application/json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void importProject(file)
        }}
      />
      <section className="m-group">
        <label className="m-field">
          <span>Name</span>
          <input
            value={project.name}
            maxLength={60}
            onChange={(event) => updateProject({ name: event.target.value }, { coalesce: 'project-name' })}
            enterKeyHint="done"
          />
        </label>
        <Stepper
          label="Tempo"
          value={`${project.bpm} BPM`}
          onDec={() => updateProject({ bpm: Math.max(40, project.bpm - 1) }, { coalesce: 'bpm' })}
          onInc={() => updateProject({ bpm: Math.min(240, project.bpm + 1) }, { coalesce: 'bpm' })}
          disableDec={project.bpm <= 40}
          disableInc={project.bpm >= 240}
        />
        <Slider
          label="Slide to adjust"
          value={project.bpm}
          min={40}
          max={240}
          step={1}
          format={(v) => `${Math.round(v)}`}
          onChange={(bpm) => updateProject({ bpm }, { coalesce: 'bpm' })}
        />
      </section>

      <section className="m-group">
        <h3>Key &amp; feel</h3>
        <div className="m-chips m-chips-wrap" role="group" aria-label="Key">
          {KEY_ROOTS.map((root) => (
            <button key={root} className={project.key === root ? 'is-on' : ''} onClick={() => updateProject({ key: root })}>
              {root}
            </button>
          ))}
        </div>
        <Segmented
          label="Scale"
          value={project.scale}
          options={[
            { value: 'minor', label: 'Minor' },
            { value: 'major', label: 'Major' },
          ]}
          onChange={(scale) => updateProject({ scale })}
        />
        <Segmented
          label="Time signature"
          value={project.timeSig}
          options={[
            { value: 4, label: '4 / 4' },
            { value: 3, label: '3 / 4' },
          ]}
          onChange={(timeSig) => updateProject({ timeSig })}
        />
        <div className="m-switch-row">
          <span>
            Swing
            <small>Give 8ths or 16ths a laid-back bounce.</small>
          </span>
          <button
            role="switch"
            aria-checked={project.swing.enabled}
            className={`m-switch ${project.swing.enabled ? 'is-on' : ''}`}
            onClick={() => updateProject({ swing: { ...project.swing, enabled: !project.swing.enabled } })}
          >
            <i />
          </button>
        </div>
        {project.swing.enabled && (
          <>
            <Slider
              label="Swing amount"
              value={project.swing.amount}
              min={0}
              max={100}
              step={1}
              format={(v) => `${Math.round(v)}%`}
              onChange={(amount) => updateProject({ swing: { ...project.swing, amount } }, { coalesce: 'swing' })}
            />
            <Segmented
              label="Swing division"
              value={project.swing.division}
              options={[
                { value: 8, label: '8th notes' },
                { value: 16, label: '16th notes' },
              ]}
              onChange={(division) => updateProject({ swing: { ...project.swing, division } })}
            />
          </>
        )}
        <Slider
          label="Master volume"
          value={project.master.volume}
          min={0}
          max={1}
          format={pct}
          onChange={(volume) => updateProject({ master: { ...project.master, volume } }, { coalesce: 'master-volume' })}
        />
      </section>

      <section className="m-group m-actions">
        <h3>Project</h3>
        <button className="m-row-btn" onClick={() => void exportWav()} disabled={exporting}>
          {exporting ? <Loader2 size={19} className="spin" /> : <Download size={19} />}
          <span>
            {exporting ? 'Rendering your mix…' : 'Export as WAV'}
            <small>Stereo 44.1 kHz, rendered on this device.</small>
          </span>
        </button>
        <button className="m-row-btn" onClick={saveCopy}>
          <Save size={19} />
          <span>
            Save a copy
            <small>Download a .creer.json backup.</small>
          </span>
        </button>
        <button className="m-row-btn" onClick={() => fileRef.current?.click()}>
          <FolderOpen size={19} />
          <span>
            Open a project
            <small>Import a .creer.json file.</small>
          </span>
        </button>
        <button className={`m-row-btn ${confirm === 'new' ? 'is-warn' : ''}`} onClick={() => askOrRun('new')}>
          <FilePlus2 size={19} />
          <span>
            {confirm === 'new' ? 'Tap again to start fresh' : 'New project'}
            <small>{confirm === 'new' ? 'This replaces the current song. Save a copy first if you need it.' : 'Start from a blank canvas.'}</small>
          </span>
        </button>
        <button className={`m-row-btn ${confirm === 'demo' ? 'is-warn' : ''}`} onClick={() => askOrRun('demo')}>
          <Music2 size={19} />
          <span>
            {confirm === 'demo' ? 'Tap again to load the demo' : 'Load the demo song'}
            <small>“Golden Hour”, six tracks to explore.</small>
          </span>
        </button>
        <button
          className="m-row-btn"
          onClick={() => {
            close()
            setUiPreference('desktop')
          }}
        >
          <Monitor size={19} />
          <span>
            Use the desktop version
            <small>The full studio. Best on a larger screen.</small>
          </span>
        </button>
      </section>
      <p className="m-footnote">Autosaved on this device · Creer Mobile</p>
    </Sheet>
  )
}

export function TrackSheet() {
  const trackId = useMobileStore((state) => state.trackSheetId)
  const setTrackSheetId = useMobileStore((state) => state.setTrackSheetId)
  const setSoundPicker = useMobileStore((state) => state.setSoundPicker)
  const setTab = useMobileStore((state) => state.setTab)
  const project = useProjectStore((state) => state.project)
  const updateTrack = useProjectStore((state) => state.updateTrack)
  const removeTrack = useProjectStore((state) => state.removeTrack)
  const apply = useProjectStore((state) => state.apply)
  const selectTrack = useProjectStore((state) => state.selectTrack)
  const toast = useSessionStore((state) => state.toast)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const track = project.tracks.find((item) => item.id === trackId)

  const close = () => {
    setConfirmDelete(false)
    setTrackSheetId(null)
  }

  if (!track) return <Sheet open={false} title="" onClose={close}>{null}</Sheet>

  const info = INSTRUMENT_MAP[track.instrument]
  const drums = isDrumInstrument(track.instrument)
  const voice = resolveVoice(track.voice)
  const setVoice = (patch: Partial<typeof voice>, key: string) =>
    updateTrack(track.id, { voice: { ...voice, ...patch } }, { coalesce: `voice-${key}:${track.id}` })

  const duplicate = () => {
    const copy = {
      ...track,
      id: uid('t'),
      name: `${track.name} copy`,
      armed: false,
      effects: track.effects.map((effect) => ({ ...effect, id: uid('fx'), params: { ...effect.params } })),
      clips: track.clips.map((clip) => ({
        ...clip,
        id: uid('c'),
        notes: clip.notes.map((note) => ({ ...note, id: uid('n') })),
      })),
    }
    apply((current) => {
      const index = current.tracks.findIndex((item) => item.id === track.id)
      const tracks = [...current.tracks]
      tracks.splice(index + 1, 0, copy)
      return { ...current, tracks }
    })
    selectTrack(copy.id, null)
    toast('Track duplicated', `“${copy.name}” was added.`, 'success')
    close()
  }

  return (
    <Sheet open eyebrow="TRACK" title={track.name} onClose={close} size="tall">
      <section className="m-group">
        <label className="m-field">
          <span>Name</span>
          <input
            value={track.name}
            maxLength={40}
            onChange={(event) => updateTrack(track.id, { name: event.target.value }, { coalesce: `rename:${track.id}` })}
            enterKeyHint="done"
          />
        </label>
        <button
          className="m-row-btn"
          style={{ '--c': track.color } as CSSProperties}
          onClick={() => {
            selectTrack(track.id)
            setSoundPicker('assign')
          }}
        >
          <span className="m-row-icon">
            <TrackIcon instrument={track.instrument} size={19} />
          </span>
          <span>
            {info.name}
            <small>{info.category} · tap to change the sound</small>
          </span>
        </button>
        <div className="m-swatches" role="group" aria-label="Track colour">
          {TRACK_COLORS.map((color) => (
            <button
              key={color.value}
              className={track.color === color.value ? 'is-on' : ''}
              style={{ background: color.value }}
              onClick={() => updateTrack(track.id, { color: color.value })}
              aria-label={color.name}
              aria-pressed={track.color === color.value}
            />
          ))}
        </div>
        <div className="m-pair">
          <button className={`m-btn ${track.mute ? 'is-mute' : ''}`} onClick={() => updateTrack(track.id, { mute: !track.mute })}>
            {track.mute ? <VolumeX size={16} /> : <Volume2 size={16} />} {track.mute ? 'Muted' : 'Mute'}
          </button>
          <button className={`m-btn ${track.solo ? 'is-solo' : ''}`} onClick={() => updateTrack(track.id, { solo: !track.solo })}>
            Solo
          </button>
        </div>
      </section>

      <section className="m-group">
        <h3>Mix</h3>
        <Slider label="Volume" value={track.volume} min={0} max={1} color={track.color} format={pct} onChange={(volume) => updateTrack(track.id, { volume }, { coalesce: `vol:${track.id}` })} />
        <Slider label="Pan" value={track.pan} min={-1} max={1} center color={track.color} format={panLabel} onChange={(pan) => updateTrack(track.id, { pan: Math.abs(pan) < 0.04 ? 0 : pan }, { coalesce: `pan:${track.id}` })} />
        <Slider label="Reverb" value={track.reverbSend} min={0} max={0.8} color={track.color} format={(v) => pct(v / 0.8)} onChange={(reverbSend) => updateTrack(track.id, { reverbSend }, { coalesce: `rev:${track.id}` })} />
        <Slider label="Echo" value={track.delaySend} min={0} max={0.6} color={track.color} format={(v) => pct(v / 0.6)} onChange={(delaySend) => updateTrack(track.id, { delaySend }, { coalesce: `dly:${track.id}` })} />
      </section>

      <section className="m-group">
        <h3>Voice</h3>
        {!drums && (
          <>
            <Stepper
              label="Octave"
              value={voice.octave > 0 ? `+${voice.octave}` : voice.octave}
              onDec={() => setVoice({ octave: Math.max(-2, voice.octave - 1) }, 'oct')}
              onInc={() => setVoice({ octave: Math.min(2, voice.octave + 1) }, 'oct')}
              disableDec={voice.octave <= -2}
              disableInc={voice.octave >= 2}
            />
            <Slider label="Attack" value={voice.attack} min={0} max={1.5} color={track.color} format={(v) => (v < 0.01 ? 'Off' : `${Math.round(v * 1000)} ms`)} onChange={(attack) => setVoice({ attack: attack < 0.01 ? 0 : attack }, 'atk')} />
          </>
        )}
        <Slider label="Tone" value={voice.tone} min={-1} max={1} center color={track.color} format={(v) => (Math.abs(v) < 0.03 ? 'Flat' : `${v < 0 ? 'Dark' : 'Bright'} ${Math.round(Math.abs(v) * 100)}`)} onChange={(tone) => setVoice({ tone: Math.abs(tone) < 0.04 ? 0 : tone }, 'tone')} />
        <Slider label="Dynamics" value={voice.dynamics} min={0} max={1} color={track.color} format={pct} onChange={(dynamics) => setVoice({ dynamics }, 'dyn')} />
        <button className="m-link" onClick={() => updateTrack(track.id, { voice: { ...DEFAULT_VOICE } })}>
          Reset voice
        </button>
      </section>

      <section className="m-group m-actions">
        <button
          className="m-row-btn"
          onClick={() => {
            selectTrack(track.id)
            setTab('play')
            close()
          }}
        >
          <Piano size={19} />
          <span>
            Play this track
            <small>Open the keys or pads and record a take.</small>
          </span>
        </button>
        <button className="m-row-btn" onClick={duplicate}>
          <Copy size={19} />
          <span>
            Duplicate track
            <small>Copies the sound, mix and every region.</small>
          </span>
        </button>
        <button
          className={`m-row-btn ${confirmDelete ? 'is-warn' : ''}`}
          disabled={project.tracks.length <= 1}
          onClick={() => {
            if (!confirmDelete) {
              setConfirmDelete(true)
              return
            }
            removeTrack(track.id)
            toast('Track deleted', 'Undo brings it back.')
            close()
          }}
        >
          <Trash2 size={19} />
          <span>
            {confirmDelete ? 'Tap again to delete' : 'Delete track'}
            <small>{project.tracks.length <= 1 ? 'A song needs at least one track.' : 'Removes the track and its regions.'}</small>
          </span>
        </button>
      </section>
    </Sheet>
  )
}

export function SoundSheet() {
  const mode = useMobileStore((state) => state.soundPicker)
  const setMode = useMobileStore((state) => state.setSoundPicker)
  return (
    <Sheet
      open={mode !== null}
      eyebrow={mode === 'add' ? 'NEW TRACK' : 'SOUND'}
      title={mode === 'add' ? 'Pick a sound' : 'Choose a sound'}
      onClose={() => setMode(null)}
      size="tall"
    >
      <SoundBrowser allowAssign={mode === 'assign'} onDone={() => setMode(null)} />
    </Sheet>
  )
}
