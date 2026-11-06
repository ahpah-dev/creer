import { useProjectStore, getSelectedClip } from '../store/project'
import { useSessionStore } from '../store/session'
import { getCurrentBeat } from './transport'
import { clamp, formatBeatPosition, MOD_LABEL, snapBeat, uid } from './utils'
import type { Clip, Note } from '../types'

export const makeClip = (name: string, start: number, length: number): Clip => ({
  id: uid('c'),
  name,
  start,
  length,
  notes: [],
})

export const addClipOnTrack = (trackId: string, beat?: number, lengthBars = 4) => {
  const store = useProjectStore.getState()
  const project = store.project
  const at = beat ?? getCurrentBeat()
  const snapped = Math.max(0, Math.floor(at / project.timeSig) * project.timeSig)
  const length = lengthBars * project.timeSig
  const track = project.tracks.find((item) => item.id === trackId)
  if (!track) return null
  const existing = track.clips.filter((clip) => clip.start < snapped + length && clip.start + clip.length > snapped).length
  const clip = makeClip(existing ? `Idea ${existing + 1}` : 'New idea', snapped, length)
  store.addClip(trackId, clip)
  useSessionStore.getState().setDock('editor')
  useSessionStore.getState().setSelectedNoteIds([])
  return clip
}

export const deleteSelectedClip = () => {
  const store = useProjectStore.getState()
  const session = useSessionStore.getState()
  if (session.selectedNoteIds.length) return
  const ids = store.selectedClipIds.length
    ? store.selectedClipIds
    : store.selectedClipId
      ? [store.selectedClipId]
      : []
  if (!ids.length) return
  store.deleteClips(ids)
  session.toast(
    `${ids.length} clip${ids.length === 1 ? '' : 's'} deleted`,
    `${MOD_LABEL}+Z brings ${ids.length === 1 ? 'it' : 'them'} back.`,
    'default',
  )
}

export const duplicateSelectedClip = () => {
  const store = useProjectStore.getState()
  const session = useSessionStore.getState()
  const selected = getSelectedClip(store.project, store.selectedClipId)
  if (!selected) return
  store.duplicateClip(selected.track.id, selected.clip.id)
  session.toast('Clip duplicated', `"${selected.clip.name}" copied to the next slot.`)
}

export const splitSelectedClip = () => {
  const store = useProjectStore.getState()
  const session = useSessionStore.getState()
  const selected = getSelectedClip(store.project, store.selectedClipId)
  if (!selected) return
  const beat = getCurrentBeat()
  const { clip, track } = selected
  if (beat <= clip.start + 0.01 || beat >= clip.start + clip.length - 0.01) return
  const relative = beat - clip.start
  const leftNotes: Note[] = []
  const rightNotes: Note[] = []
  for (const note of clip.notes) {
    const noteEnd = note.start + note.duration
    if (noteEnd <= relative + 1e-6) {
      leftNotes.push(note)
    } else if (note.start >= relative - 1e-6) {
      rightNotes.push({ ...note, id: uid('n'), start: note.start - relative })
    } else {
      const leftDuration = Math.max(0.03, relative - note.start)
      leftNotes.push({ ...note, duration: leftDuration })
      const rightDuration = Math.max(0.03, noteEnd - relative)
      rightNotes.push({ ...note, id: uid('n'), start: 0, duration: rightDuration })
    }
  }
  const rightClip: Clip = {
    ...clip,
    id: uid('c'),
    name: clip.name,
    start: beat,
    length: clip.length - relative,
    notes: rightNotes,
  }
  const leftClip: Clip = { ...clip, length: relative, notes: leftNotes }
  store.apply((project) => ({
    ...project,
    tracks: project.tracks.map((item) =>
      item.id !== track.id
        ? item
        : { ...item, clips: item.clips.flatMap((itemClip) => (itemClip.id === clip.id ? [leftClip, rightClip] : [itemClip])) },
    ),
  }))
  store.selectClip(track.id, rightClip.id)
  session.toast('Clip split', `Cut at ${formatBeatPosition(beat, store.project.timeSig)}.`)
}

export const quantizeNotes = (notes: Note[], grid: number, clipLength = Infinity) =>
  notes.map((note) => {
    const start = Math.max(0, Math.round(note.start / grid) * grid)
    const maxDuration = Number.isFinite(clipLength) ? Math.max(0.05, clipLength - start) : Infinity
    const duration = Math.min(maxDuration, Math.max(grid, Math.round(note.duration / grid) * grid))
    return { ...note, start, duration }
  })

export const clampClipStart = (start: number, _length: number, projectLength: number) =>
  clamp(start, 0, Math.max(0, projectLength))

export const snapClipStart = (start: number, snap: number) => Math.max(0, snapBeat(start, snap))
