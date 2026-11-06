import { create } from 'zustand'
import type { Clip, Note, Project, Track } from '../types'
import { createDemoProject, createEmptyProject } from '../data/demo'
import { deepClone, projectEnd, uid } from '../lib/utils'

const STORAGE_KEY = 'creer.project.v1'
const HISTORY_LIMIT = 80

export const normalizeProject = (input: unknown): Project => {
  if (!input || typeof input !== 'object') throw new Error('Project is not an object')
  const raw = input as Partial<Project>
  if (!Array.isArray(raw.tracks)) throw new Error('Project has no tracks')
  const tracks: Track[] = raw.tracks.map((track) => ({
    id: track.id ?? uid('t'),
    name: track.name ?? 'Untitled Track',
    instrument: track.instrument ?? 'piano',
    color: track.color ?? '#e0a465',
    volume: typeof track.volume === 'number' ? track.volume : 0.7,
    pan: typeof track.pan === 'number' ? track.pan : 0,
    mute: Boolean(track.mute),
    solo: Boolean(track.solo),
    armed: Boolean(track.armed),
    reverbSend: typeof track.reverbSend === 'number' ? track.reverbSend : 0.12,
    delaySend: typeof track.delaySend === 'number' ? track.delaySend : 0.05,
    clips: Array.isArray(track.clips)
      ? track.clips.map((clip) => ({
          id: clip.id ?? uid('c'),
          name: clip.name ?? 'Clip',
          start: Math.max(0, clip.start ?? 0),
          length: Math.max(0.25, clip.length ?? 4),
          notes: Array.isArray(clip.notes)
            ? clip.notes.map((note) => ({
                id: note.id ?? uid('n'),
                pitch: Math.max(0, Math.min(127, note.pitch ?? 60)),
                start: Math.max(0, note.start ?? 0),
                duration: Math.max(0.03, note.duration ?? 1),
                velocity: Math.max(0.05, Math.min(1, note.velocity ?? 0.8)),
              }))
            : [],
        }))
      : [],
  }))
  const lengthBeats = Math.max(
    16,
    raw.lengthBeats ?? 64,
    ...tracks.flatMap((track) => track.clips.map((clip) => clip.start + clip.length)),
  )
  const project: Project = {
    version: 1,
    id: raw.id ?? uid('project'),
    name: raw.name ?? 'Untitled Song',
    bpm: Math.max(40, Math.min(240, raw.bpm ?? 96)),
    timeSig: raw.timeSig === 3 ? 3 : 4,
    key: raw.key ?? 'A',
    scale: raw.scale === 'major' ? 'major' : 'minor',
    lengthBeats,
    tracks,
    sections: Array.isArray(raw.sections) ? raw.sections : [],
    loop: {
      enabled: Boolean(raw.loop?.enabled),
      start: Math.max(0, raw.loop?.start ?? 0),
      end: Math.max(1, raw.loop?.end ?? 16),
    },
    swing: {
      enabled: Boolean(raw.swing?.enabled),
      amount: Math.max(
        0,
        Math.min(
          100,
          typeof raw.swing?.amount === 'number' ? raw.swing.amount : 50,
        ),
      ),
      division: raw.swing?.division === 16 ? 16 : 8,
    },
    master: {
      volume: typeof raw.master?.volume === 'number' ? raw.master.volume : 0.8,
      reverb: typeof raw.master?.reverb === 'number' ? raw.master.reverb : 0.28,
      delay: typeof raw.master?.delay === 'number' ? raw.master.delay : 0.16,
    },
    createdAt: raw.createdAt ?? new Date().toISOString(),
    updatedAt: raw.updatedAt ?? new Date().toISOString(),
  }
  if (project.loop.end > project.lengthBeats) project.loop.end = project.lengthBeats
  if (project.loop.start >= project.loop.end) {
    project.loop.start = 0
    project.loop.end = Math.min(project.lengthBeats, 16)
  }
  return project
}

const loadInitialProject = (): Project => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return normalizeProject(JSON.parse(raw))
  } catch {
    // A malformed save should never prevent the studio from opening.
  }
  return createDemoProject()
}

interface HistoryEntry {
  key: string | null
  time: number
}

interface UpdateOptions {
  history?: boolean
  coalesce?: string
}

interface ProjectState {
  project: Project
  past: Project[]
  future: Project[]
  selectedTrackId: string
  selectedClipId: string | null
  selectedClipIds: string[]
  lastHistoryKey: HistoryEntry | null
  apply: (updater: (project: Project) => Project, options?: UpdateOptions) => void
  undo: () => void
  redo: () => void
  selectTrack: (trackId: string, clipId?: string | null) => void
  selectClip: (trackId: string, clipId: string) => void
  selectClips: (clipIds: string[], primaryId?: string | null) => void
  updateProject: (patch: Partial<Project>, options?: UpdateOptions) => void
  updateTrack: (trackId: string, patch: Partial<Track>, options?: UpdateOptions) => void
  updateTrackBy: (trackId: string, updater: (track: Track) => Track, options?: UpdateOptions) => void
  addTrack: (track: Track) => void
  removeTrack: (trackId: string) => void
  addClip: (trackId: string, clip: Clip, options?: UpdateOptions) => void
  updateClip: (trackId: string, clipId: string, patch: Partial<Clip>, options?: UpdateOptions) => void
  updateNotes: (trackId: string, clipId: string, notes: Note[], options?: UpdateOptions) => void
  deleteClip: (trackId: string, clipId: string) => void
  deleteClips: (clipIds: string[]) => void
  duplicateClip: (trackId: string, clipId: string) => void
  replaceProject: (project: Project, opts?: { clearHistory?: boolean }) => void
  resetToDemo: () => void
  newProject: () => void
}

const initialProject = loadInitialProject()

const pickInitialSelection = (project: Project) => {
  const selectedTrack = project.tracks[2] ?? project.tracks[0]
  const selectedClip = selectedTrack?.clips[Math.min(1, selectedTrack.clips.length - 1)] ?? null
  return {
    selectedTrackId: selectedTrack?.id ?? '',
    selectedClipId: selectedClip?.id ?? null,
    selectedClipIds: selectedClip ? [selectedClip.id] : [],
  }
}

const initialSelection = pickInitialSelection(initialProject)

const reconcileSelection = (
  project: Project,
  clipIds: string[],
  primaryId: string | null,
  fallbackTrackId: string,
) => {
  const valid = new Set(project.tracks.flatMap((track) => track.clips.map((clip) => clip.id)))
  let selectedClipIds = [...new Set(clipIds)].filter((id) => valid.has(id))
  let selectedClipId = primaryId && valid.has(primaryId) ? primaryId : null
  if (selectedClipId && !selectedClipIds.includes(selectedClipId)) {
    selectedClipIds = [selectedClipId, ...selectedClipIds]
  }
  if (!selectedClipId) selectedClipId = selectedClipIds[0] ?? null
  let selectedTrackId = project.tracks.some((track) => track.id === fallbackTrackId)
    ? fallbackTrackId
    : (project.tracks[0]?.id ?? '')
  if (selectedClipId) {
    const owner = project.tracks.find((track) =>
      track.clips.some((clip) => clip.id === selectedClipId),
    )
    if (owner) selectedTrackId = owner.id
  }
  return { selectedClipIds, selectedClipId, selectedTrackId }
}

const makeId = (prefix: string) => uid(prefix)

const withTimestamp = (project: Project): Project => ({
  ...project,
  updatedAt: new Date().toISOString(),
})

export const useProjectStore = create<ProjectState>((set, get) => {
  const apply = (updater: (project: Project) => Project, options: UpdateOptions = {}) => {
    const state = get()
    const nextRaw = updater(state.project)
    if (nextRaw === state.project) return
    const next = withTimestamp(nextRaw)
    const now = Date.now()
    const history = options.history !== false
    let shouldPush = history
    let nextKey: HistoryEntry | null = null
    if (history && options.coalesce) {
      const previous = state.lastHistoryKey
      const continuing =
        previous && previous.key === options.coalesce && now - previous.time < 900
      shouldPush = !continuing
      nextKey = { key: options.coalesce, time: now }
    } else if (history) {
      nextKey = { key: null, time: now }
    }
    const past = shouldPush ? [...state.past.slice(-HISTORY_LIMIT + 1), state.project] : state.past
    set({
      project: next,
      past,
      future: shouldPush ? [] : state.future,
      lastHistoryKey: nextKey,
    })
  }

  return {
    project: initialProject,
    past: [],
    future: [],
    ...initialSelection,
    lastHistoryKey: null,
    apply,
    undo: () => {
      const state = get()
      if (!state.past.length) return
      const previous = state.past[state.past.length - 1]
      const selection = reconcileSelection(
        previous,
        state.selectedClipIds,
        state.selectedClipId,
        state.selectedTrackId,
      )
      set({
        project: previous,
        past: state.past.slice(0, -1),
        future: [state.project, ...state.future].slice(0, HISTORY_LIMIT),
        ...selection,
        lastHistoryKey: null,
      })
    },
    redo: () => {
      const state = get()
      if (!state.future.length) return
      const next = state.future[0]
      const selection = reconcileSelection(
        next,
        state.selectedClipIds,
        state.selectedClipId,
        state.selectedTrackId,
      )
      set({
        project: next,
        past: [...state.past, state.project].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
        ...selection,
        lastHistoryKey: null,
      })
    },
    selectTrack: (trackId, clipId) => {
      const nextClipId = clipId === undefined ? get().selectedClipId : clipId
      set({
        selectedTrackId: trackId,
        selectedClipId: nextClipId,
        selectedClipIds: nextClipId ? [nextClipId] : [],
      })
    },
    selectClip: (trackId, clipId) => {
      set({
        selectedTrackId: trackId,
        selectedClipId: clipId,
        selectedClipIds: [clipId],
      })
    },
    selectClips: (clipIds, primaryId) => {
      const state = get()
      const selection = reconcileSelection(
        state.project,
        clipIds,
        primaryId ?? clipIds[0] ?? null,
        state.selectedTrackId,
      )
      set(selection)
    },
    updateProject: (patch, options) => {
      apply((project) => ({ ...project, ...patch }), options)
    },
    updateTrack: (trackId, patch, options) => {
      apply(
        (project) => ({
          ...project,
          tracks: project.tracks.map((track) => (track.id === trackId ? { ...track, ...patch } : track)),
        }),
        options,
      )
    },
    updateTrackBy: (trackId, updater, options) => {
      apply(
        (project) => ({
          ...project,
          tracks: project.tracks.map((track) => (track.id === trackId ? updater(track) : track)),
        }),
        options,
      )
    },
    addTrack: (track) => {
      apply((project) => ({
        ...project,
        tracks: [...project.tracks, track],
        lengthBeats: Math.max(project.lengthBeats, 32),
      }))
      set({ selectedTrackId: track.id, selectedClipId: null, selectedClipIds: [] })
    },
    removeTrack: (trackId) => {
      const state = get()
      const remaining = state.project.tracks.filter((track) => track.id !== trackId)
      if (!remaining.length) return
      const nextProject = { ...state.project, tracks: remaining }
      apply((project) => ({ ...project, tracks: remaining }))
      set(
        reconcileSelection(
          nextProject,
          state.selectedClipIds,
          state.selectedClipId,
          state.selectedTrackId === trackId ? (remaining[0]?.id ?? '') : state.selectedTrackId,
        ),
      )
    },
    addClip: (trackId, clip, options) => {
      apply(
        (project) => ({
          ...project,
          tracks: project.tracks.map((track) =>
            track.id === trackId ? { ...track, clips: [...track.clips, clip] } : track,
          ),
          lengthBeats: Math.max(project.lengthBeats, clip.start + clip.length),
        }),
        options,
      )
      set({
        selectedTrackId: trackId,
        selectedClipId: clip.id,
        selectedClipIds: [clip.id],
      })
    },
    updateClip: (trackId, clipId, patch, options) => {
      apply(
        (project) => {
          const tracks = project.tracks.map((track) =>
            track.id === trackId
              ? {
                  ...track,
                  clips: track.clips.map((clip) => (clip.id === clipId ? { ...clip, ...patch } : clip)),
                }
              : track,
          )
          const clip = tracks.flatMap((track) => track.clips).find((item) => item.id === clipId)
          return {
            ...project,
            tracks,
            lengthBeats: clip
              ? Math.max(project.lengthBeats, Math.ceil((clip.start + clip.length) / 4) * 4)
              : project.lengthBeats,
          }
        },
        options,
      )
    },
    updateNotes: (trackId, clipId, notes, options) => {
      apply(
        (project) => ({
          ...project,
          tracks: project.tracks.map((track) =>
            track.id === trackId
              ? {
                  ...track,
                  clips: track.clips.map((clip) => (clip.id === clipId ? { ...clip, notes } : clip)),
                }
              : track,
          ),
        }),
        options,
      )
    },
    deleteClip: (_trackId, clipId) => {
      get().deleteClips([clipId])
    },
    deleteClips: (clipIds) => {
      const state = get()
      const doomed = new Set(clipIds)
      if (!doomed.size) return
      const nextProject = {
        ...state.project,
        tracks: state.project.tracks.map((track) => ({
          ...track,
          clips: track.clips.filter((clip) => !doomed.has(clip.id)),
        })),
      }
      apply(() => nextProject)
      const remainingSelection = state.selectedClipIds.filter((id) => !doomed.has(id))
      const nextPrimary =
        state.selectedClipId && !doomed.has(state.selectedClipId)
          ? state.selectedClipId
          : (remainingSelection[0] ?? null)
      set(
        reconcileSelection(
          nextProject,
          remainingSelection,
          nextPrimary,
          state.selectedTrackId,
        ),
      )
    },
    duplicateClip: (trackId, clipId) => {
      const state = get()
      const track = state.project.tracks.find((item) => item.id === trackId)
      const clip = track?.clips.find((item) => item.id === clipId)
      if (!track || !clip) return
      const newClip: Clip = {
        ...deepClone(clip),
        id: makeId('c'),
        name: clip.name,
        start: clip.start + clip.length,
        notes: clip.notes.map((note) => ({ ...note, id: makeId('n') })),
      }
      apply((project) => ({
        ...project,
        tracks: project.tracks.map((item) =>
          item.id === trackId ? { ...item, clips: [...item.clips, newClip] } : item,
        ),
        lengthBeats: Math.max(project.lengthBeats, newClip.start + newClip.length),
      }))
      set({
        selectedClipId: newClip.id,
        selectedClipIds: [newClip.id],
        selectedTrackId: trackId,
      })
    },
    replaceProject: (project, opts = {}) => {
      const normalized = normalizeProject(project)
      set({
        project: normalized,
        past: opts.clearHistory ? [] : get().past,
        future: opts.clearHistory ? [] : get().future,
        ...pickInitialSelection(normalized),
        lastHistoryKey: null,
      })
    },
    resetToDemo: () => {
      const demo = createDemoProject()
      get().replaceProject(demo, { clearHistory: true })
    },
    newProject: () => {
      const empty = createEmptyProject()
      get().replaceProject(empty, { clearHistory: true })
    },
  }
})

export const getSelectedClip = (project: Project, selectedClipId: string | null) => {
  if (!selectedClipId) return null
  for (const track of project.tracks) {
    const clip = track.clips.find((item) => item.id === selectedClipId)
    if (clip) return { track, clip }
  }
  return null
}

export const getSelectedClips = (project: Project, selectedClipIds: string[]) => {
  const wanted = new Set(selectedClipIds)
  const selected: { track: Track; clip: Clip }[] = []
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (wanted.has(clip.id)) selected.push({ track, clip })
    }
  }
  return selected
}

export const saveProjectToStorage = (project: Project) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project))
    return true
  } catch {
    return false
  }
}

export const clearStoredProject = () => {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* noop */
  }
}

export const projectStats = (project: Project) => {
  const clips = project.tracks.reduce((sum, track) => sum + track.clips.length, 0)
  const notes = project.tracks.reduce(
    (sum, track) => sum + track.clips.reduce((count, clip) => count + clip.notes.length, 0),
    0,
  )
  return { clips, notes, tracks: project.tracks.length, lengthBeats: projectEnd(project) }
}
