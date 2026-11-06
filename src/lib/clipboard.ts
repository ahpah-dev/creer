import type { Clip, Note } from '../types'
import { getSelectedClip, getSelectedClips, useProjectStore } from '../store/project'
import { useSessionStore } from '../store/session'
import { getCurrentBeat } from './transport'
import { clamp, formatBeatPosition, MOD_LABEL, snapBeat, uid } from './utils'

type ClipboardNote = Omit<Note, 'id'>

interface ClipClipboardEntry {
  trackId: string
  start: number
  length: number
  name: string
  notes: Note[]
}

type Clipboard =
  | { kind: 'clips'; entries: ClipClipboardEntry[] }
  | { kind: 'notes'; notes: ClipboardNote[] }
  | null

let clipboard: Clipboard = null

export const getClipboardKind = () => clipboard?.kind ?? null

const toast = (
  title: string,
  detail?: string,
  tone: 'default' | 'success' | 'warn' = 'default',
) => useSessionStore.getState().toast(title, detail, tone)

export const copySelectedNotes = (silent = false) => {
  const store = useProjectStore.getState()
  const session = useSessionStore.getState()
  const selected = getSelectedClip(store.project, store.selectedClipId)
  if (!selected || !session.selectedNoteIds.length) {
    if (!silent) toast('Nothing to copy', 'Select notes in the piano roll first.', 'warn')
    return false
  }
  const wanted = new Set(session.selectedNoteIds)
  const notes = selected.clip.notes.filter((note) => wanted.has(note.id))
  if (!notes.length) return false
  const anchor = Math.min(...notes.map((note) => note.start))
  clipboard = {
    kind: 'notes',
    notes: notes.map((note) => ({
      pitch: note.pitch,
      start: note.start - anchor,
      duration: note.duration,
      velocity: note.velocity,
    })),
  }
  if (!silent) {
    toast(
      `${notes.length} note${notes.length === 1 ? '' : 's'} copied`,
      `${MOD_LABEL}+V pastes at the playhead.`,
      'success',
    )
  }
  return true
}

export const cutSelectedNotes = () => {
  const store = useProjectStore.getState()
  const session = useSessionStore.getState()
  const selected = getSelectedClip(store.project, store.selectedClipId)
  if (!selected || !session.selectedNoteIds.length) {
    toast('Nothing to cut', 'Select notes in the piano roll first.', 'warn')
    return
  }
  if (!copySelectedNotes(true)) return
  const wanted = new Set(session.selectedNoteIds)
  store.updateNotes(
    selected.track.id,
    selected.clip.id,
    selected.clip.notes.filter((note) => !wanted.has(note.id)),
  )
  session.setSelectedNoteIds([])
  toast(
    `${wanted.size} note${wanted.size === 1 ? '' : 's'} cut`,
    `${MOD_LABEL}+V pastes at the playhead.`,
  )
}

export const copySelectedClips = (silent = false) => {
  const store = useProjectStore.getState()
  const ids = store.selectedClipIds.length
    ? store.selectedClipIds
    : store.selectedClipId
      ? [store.selectedClipId]
      : []
  if (!ids.length) {
    if (!silent) toast('Nothing to copy', 'Select one or more clips in the timeline first.', 'warn')
    return false
  }
  const selected = getSelectedClips(store.project, ids)
  if (!selected.length) return false
  const anchor = Math.min(...selected.map(({ clip }) => clip.start))
  clipboard = {
    kind: 'clips',
    entries: selected.map(({ track, clip }) => ({
      trackId: track.id,
      start: clip.start - anchor,
      length: clip.length,
      name: clip.name,
      notes: clip.notes.map((note) => ({ ...note })),
    })),
  }
  if (!silent) {
    toast(
      `${selected.length} clip${selected.length === 1 ? '' : 's'} copied`,
      `${MOD_LABEL}+V pastes at the playhead.`,
      'success',
    )
  }
  return true
}

export const cutSelectedClips = () => {
  const store = useProjectStore.getState()
  const ids = store.selectedClipIds.length
    ? store.selectedClipIds
    : store.selectedClipId
      ? [store.selectedClipId]
      : []
  if (!ids.length) {
    toast('Nothing to cut', 'Select one or more clips in the timeline first.', 'warn')
    return
  }
  if (!copySelectedClips(true)) return
  store.deleteClips(ids)
  toast(
    `${ids.length} clip${ids.length === 1 ? '' : 's'} cut`,
    `${MOD_LABEL}+V pastes at the playhead.`,
  )
}

const pasteClips = (entries: ClipClipboardEntry[]) => {
  const store = useProjectStore.getState()
  const session = useSessionStore.getState()
  const beat = Math.max(0, snapBeat(getCurrentBeat(), session.snap))
  const project = store.project
  const created: { trackId: string; clip: Clip }[] = []
  for (const entry of entries) {
    const track = project.tracks.find((item) => item.id === entry.trackId)
    if (!track) continue
    created.push({
      trackId: track.id,
      clip: {
        id: uid('c'),
        name: entry.name,
        start: beat + entry.start,
        length: entry.length,
        notes: entry.notes.map((note) => ({ ...note, id: uid('n') })),
      },
    })
  }
  if (!created.length) {
    toast('Nothing pasted', 'The target tracks are no longer available.', 'warn')
    return
  }
  store.apply((current) => {
    const byTrack = new Map<string, Clip[]>()
    for (const item of created) {
      const list = byTrack.get(item.trackId) ?? []
      list.push(item.clip)
      byTrack.set(item.trackId, list)
    }
    const tracks = current.tracks.map((track) => {
      const additions = byTrack.get(track.id)
      return additions ? { ...track, clips: [...track.clips, ...additions] } : track
    })
    const end = created.reduce((max, item) => Math.max(max, item.clip.start + item.clip.length), 0)
    return {
      ...current,
      tracks,
      lengthBeats: Math.max(current.lengthBeats, Math.ceil(end / current.timeSig) * current.timeSig),
    }
  })
  const newIds = created.map((item) => item.clip.id)
  store.selectClips(newIds, newIds[0])
  session.setSelectedNoteIds([])
  toast(
    `${created.length} clip${created.length === 1 ? '' : 's'} pasted`,
    `Pasted at ${formatBeatPosition(beat, project.timeSig)}.`,
    'success',
  )
}

const pasteNotes = (notes: ClipboardNote[]) => {
  const store = useProjectStore.getState()
  const session = useSessionStore.getState()
  const selected = getSelectedClip(store.project, store.selectedClipId)
  if (!selected) {
    toast('Open a clip first', 'Piano-roll notes paste into the selected clip.', 'warn')
    return
  }
  const { track, clip } = selected
  const playheadInClip = getCurrentBeat() - clip.start
  const rawTarget =
    playheadInClip >= 0 && playheadInClip < clip.length ? playheadInClip : 0
  const target = clamp(snapBeat(rawTarget, session.snap), 0, clip.length)
  const created: Note[] = []
  for (const note of notes) {
    const start = target + note.start
    if (start >= clip.length - 0.001) continue
    const duration = clamp(note.duration, 0.03, Math.max(0.03, clip.length - start))
    created.push({
      id: uid('n'),
      pitch: note.pitch,
      start,
      duration,
      velocity: note.velocity,
    })
  }
  if (!created.length) {
    toast('No room to paste', 'Move the playhead earlier in the clip and try again.', 'warn')
    return
  }
  store.updateNotes(track.id, clip.id, [...clip.notes, ...created])
  session.setSelectedNoteIds(created.map((note) => note.id))
  toast(
    `${created.length} note${created.length === 1 ? '' : 's'} pasted`,
    `Into "${clip.name}" at ${formatBeatPosition(clip.start + target, store.project.timeSig)}.`,
    'success',
  )
}

export const pasteClipboard = (expected?: 'clips' | 'notes') => {
  if (!clipboard || (expected && clipboard.kind !== expected)) {
    toast(
      'Nothing to paste',
      expected === 'notes'
        ? 'Select and copy notes in the piano roll first.'
        : `${MOD_LABEL}+C copies a selection first.`,
      'warn',
    )
    return
  }
  if (clipboard.kind === 'clips') {
    pasteClips(clipboard.entries)
    return
  }
  pasteNotes(clipboard.notes)
}
