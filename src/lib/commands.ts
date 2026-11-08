import { INSTRUMENTS } from '../data/instruments'
import { getSelectedClip, useProjectStore } from '../store/project'
import { useSessionStore } from '../store/session'
import type { DockTab } from '../types'
import { addClipOnTrack, deleteSelectedClip, duplicateSelectedClip, splitSelectedClip } from './clips'
import { copySelectedClips, cutSelectedClips, pasteClipboard } from './clipboard'
import { openProjectPicker, saveProjectCopy } from './projectFile'
import { toggleRecording } from './recording'
import {
  rewindTransport,
  seekTo,
  stopTransport,
  toggleLoop,
  toggleMetronome,
  toggleMute,
  togglePlayback,
  toggleSolo,
} from './transport'
import { addTrackWithStarterClip } from './tracks'
import { MOD_LABEL, SHIFT_LABEL, SNAP_OPTIONS, KEY_ROOTS } from './utils'

export type CommandSection = 'Create' | 'Transport' | 'Edit' | 'Panels' | 'Song' | 'Project' | 'Help'

export interface Command {
  id: string
  title: string
  section: CommandSection
  /** Shortcut label shown on the right. */
  hint?: string
  /** Extra words that should also match. */
  keywords?: string
  run: () => void
}

const openDock = (dock: DockTab) => () => useSessionStore.getState().setDock(dock)

/** Opens the piano roll for the selected clip, or makes a clip on the selected track first. */
export const editSelection = () => {
  const store = useProjectStore.getState()
  const session = useSessionStore.getState()
  if (!getSelectedClip(store.project, store.selectedClipId)) {
    const track = store.project.tracks.find((item) => item.id === store.selectedTrackId) ?? store.project.tracks[0]
    if (!track) return
    const nearest = track.clips[0]
    if (nearest) store.selectClip(track.id, nearest.id)
    else addClipOnTrack(track.id)
  }
  session.setDock('editor')
}

export const hasClipSelection = () => {
  const store = useProjectStore.getState()
  return store.selectedClipIds.length > 0 || Boolean(getSelectedClip(store.project, store.selectedClipId))
}

export const toggleFocusMode = () => {
  const session = useSessionStore.getState()
  if (session.dockMaximized) session.setDockMaximized(false)
  else {
    if (session.dockCollapsed) session.setDockCollapsed(false)
    session.setDockMaximized(true)
  }
}

export const buildCommands = (query: string): Command[] => {
  const store = useProjectStore.getState()
  const session = useSessionStore.getState()
  const project = store.project
  const track = project.tracks.find((item) => item.id === store.selectedTrackId)
  const hasClip = hasClipSelection()
  const commands: Command[] = []
  const add = (command: Command) => commands.push(command)

  // Dynamic commands driven by what was typed.
  const number = Number(query.trim())
  if (query.trim() && Number.isFinite(number)) {
    if (number >= 40 && number <= 240) {
      add({
        id: 'tempo-dynamic',
        title: `Set tempo to ${Math.round(number)} BPM`,
        section: 'Song',
        run: () => store.updateProject({ bpm: Math.round(number) }),
      })
    }
    if (number >= 1 && number <= 999) {
      add({
        id: 'bar-dynamic',
        title: `Go to bar ${Math.round(number)}`,
        section: 'Transport',
        run: () => seekTo((Math.round(number) - 1) * project.timeSig),
      })
    }
  }

  add({ id: 'new-track', title: 'New track…', section: 'Create', hint: 'T', keywords: 'add instrument sound', run: () => session.setModal('addTrack') })
  add({ id: 'idea', title: 'Spark a section idea', section: 'Create', keywords: 'generate idea song random inspire', run: () => session.setModal('idea') })
  add({ id: 'loops', title: 'Browse loops', section: 'Create', hint: '4', keywords: 'library samples patterns', run: openDock('loops') })
  if (track) {
    add({
      id: 'new-clip',
      title: `New clip on ${track.name}`,
      section: 'Create',
      keywords: 'add region empty',
      run: () => addClipOnTrack(track.id),
    })
  }
  for (const instrument of INSTRUMENTS) {
    add({
      id: `track-${instrument.id}`,
      title: `Add ${instrument.name} track`,
      section: 'Create',
      keywords: `${instrument.category} ${instrument.description} ${instrument.shortName} instrument sound`,
      run: () => {
        addTrackWithStarterClip(instrument.id)
      },
    })
  }

  add({ id: 'play', title: session.isPlaying ? 'Pause' : 'Play', section: 'Transport', hint: 'Space', keywords: 'stop start', run: () => void togglePlayback() })
  add({ id: 'stop', title: 'Stop', section: 'Transport', run: stopTransport })
  add({ id: 'rewind', title: 'Return to start', section: 'Transport', keywords: 'rewind beginning', run: rewindTransport })
  add({ id: 'record', title: session.isRecording ? 'Stop recording' : 'Record', section: 'Transport', hint: 'R', keywords: 'capture midi keyboard', run: () => void toggleRecording() })
  add({ id: 'loop', title: project.loop.enabled ? 'Turn loop off' : 'Turn loop on', section: 'Transport', hint: 'L', keywords: 'repeat cycle', run: toggleLoop })
  add({ id: 'metronome', title: session.metronome ? 'Turn metronome off' : 'Turn metronome on', section: 'Transport', keywords: 'click count in', run: toggleMetronome })

  add({ id: 'undo', title: 'Undo', section: 'Edit', hint: `${MOD_LABEL}Z`, run: () => store.undo() })
  add({ id: 'redo', title: 'Redo', section: 'Edit', hint: `${SHIFT_LABEL}${MOD_LABEL}Z`, run: () => store.redo() })
  add({ id: 'edit-notes', title: 'Edit notes in piano roll', section: 'Edit', hint: 'Enter', keywords: 'open editor', run: editSelection })
  if (hasClip) {
    add({ id: 'split', title: 'Split clip at playhead', section: 'Edit', keywords: 'cut', run: splitSelectedClip })
    add({ id: 'duplicate', title: 'Duplicate clip', section: 'Edit', hint: `${MOD_LABEL}D`, run: duplicateSelectedClip })
    add({ id: 'copy', title: 'Copy clips', section: 'Edit', hint: `${MOD_LABEL}C`, run: () => copySelectedClips() })
    add({ id: 'cut', title: 'Cut clips', section: 'Edit', hint: `${MOD_LABEL}X`, run: () => cutSelectedClips() })
    add({ id: 'delete', title: 'Delete clips', section: 'Edit', hint: '⌫', keywords: 'remove', run: deleteSelectedClip })
  }
  add({ id: 'paste', title: 'Paste at playhead', section: 'Edit', hint: `${MOD_LABEL}V`, run: () => pasteClipboard() })
  add({
    id: 'select-all',
    title: 'Select all clips',
    section: 'Edit',
    hint: `${MOD_LABEL}A`,
    run: () => store.selectClips(project.tracks.flatMap((item) => item.clips.map((clip) => clip.id))),
  })
  if (track) {
    add({ id: 'mute', title: `${track.mute ? 'Unmute' : 'Mute'} ${track.name}`, section: 'Edit', hint: 'M', run: () => toggleMute(track.id) })
    add({ id: 'solo', title: `${track.solo ? 'Unsolo' : 'Solo'} ${track.name}`, section: 'Edit', hint: 'S', run: () => toggleSolo(track.id) })
  }

  const panels: [DockTab, string, string, string][] = [
    ['editor', 'Piano roll', '1', 'notes editor midi'],
    ['mixer', 'Mixer', '2', 'volume pan levels faders'],
    ['effects', 'Effects', '3', 'reverb delay filter drive eq chain'],
    ['loops', 'Loops', '4', 'library patterns'],
    ['keys', 'Sounds & Keys', '5', 'instruments keyboard play voice'],
  ]
  for (const [dock, label, hint, keywords] of panels) {
    add({ id: `panel-${dock}`, title: `Open ${label}`, section: 'Panels', hint, keywords, run: openDock(dock) })
  }
  add({
    id: 'focus',
    title: session.dockMaximized ? 'Leave focus mode' : 'Focus the editor',
    section: 'Panels',
    hint: 'F',
    keywords: 'maximize fullscreen expand fill',
    run: toggleFocusMode,
  })
  add({
    id: 'collapse',
    title: session.dockCollapsed ? 'Show the editor panel' : 'Hide the editor panel',
    section: 'Panels',
    keywords: 'collapse arrange timeline only',
    run: () => session.setDockCollapsed(!session.dockCollapsed),
  })
  add({ id: 'zoom-in', title: 'Zoom timeline in', section: 'Panels', hint: '+', run: () => session.setZoom(session.zoom + 4) })
  add({ id: 'zoom-out', title: 'Zoom timeline out', section: 'Panels', hint: '−', run: () => session.setZoom(session.zoom - 4) })
  for (const option of SNAP_OPTIONS) {
    add({
      id: `snap-${option.label}`,
      title: `Snap to ${option.label}`,
      section: 'Panels',
      keywords: 'grid quantize',
      run: () => session.setSnap(option.value),
    })
  }

  for (const scale of ['minor', 'major'] as const) {
    for (const key of KEY_ROOTS) {
      add({
        id: `key-${key}-${scale}`,
        title: `Key: ${key} ${scale}`,
        section: 'Song',
        keywords: 'scale',
        run: () => store.updateProject({ key, scale }),
      })
    }
  }
  add({ id: 'meter-4', title: 'Meter: 4/4', section: 'Song', keywords: 'time signature', run: () => store.updateProject({ timeSig: 4 }) })
  add({ id: 'meter-3', title: 'Meter: 3/4', section: 'Song', keywords: 'time signature waltz', run: () => store.updateProject({ timeSig: 3 }) })
  add({
    id: 'swing',
    title: project.swing.enabled ? 'Turn swing off' : 'Turn swing on',
    section: 'Song',
    keywords: 'groove shuffle',
    run: () =>
      store.updateProject({
        swing: { ...project.swing, enabled: !project.swing.enabled, amount: project.swing.amount || 50 },
      }),
  })

  add({ id: 'project-new', title: 'New session…', section: 'Project', hint: `${MOD_LABEL}N`, keywords: 'blank fresh start over', run: () => session.setModal('new') })
  add({ id: 'project-open', title: 'Open project file…', section: 'Project', keywords: 'import load json', run: openProjectPicker })
  add({ id: 'project-save', title: 'Save a copy to your computer', section: 'Project', keywords: 'download json backup', run: saveProjectCopy })
  add({ id: 'export', title: 'Export audio…', section: 'Project', hint: `${SHIFT_LABEL}${MOD_LABEL}E`, keywords: 'wav render bounce download share', run: () => session.setModal('export') })
  add({ id: 'help', title: 'Shortcuts & guide', section: 'Help', hint: '?', keywords: 'keys help manual', run: () => session.setModal('help') })
  add({
    id: 'guide',
    title: 'Show the quick-start guide',
    section: 'Help',
    keywords: 'onboarding tutorial getting started checklist',
    run: () => {
      session.setGuideDismissed(false)
      window.dispatchEvent(new CustomEvent('creer:open-guide'))
    },
  })
  return commands
}

/** A small, forgiving score: higher is better, 0 means no match. */
export const scoreCommand = (command: Command, query: string): number => {
  const needle = query.trim().toLowerCase()
  if (!needle) return 1
  const title = command.title.toLowerCase()
  const haystack = `${title} ${command.section.toLowerCase()} ${command.keywords ?? ''}`.toLowerCase()
  const words = needle.split(/\s+/)
  let total = 0
  for (const word of words) {
    const inTitle = title.indexOf(word)
    if (inTitle === 0) total += 12
    else if (inTitle > 0 && title[inTitle - 1] === ' ') total += 9
    else if (inTitle > 0) total += 5
    else if (haystack.includes(word)) total += 2
    else return 0
  }
  return total - title.length * 0.01
}
