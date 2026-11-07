import { create } from 'zustand'
import { clamp } from '../lib/utils'

export type MobileTab = 'tracks' | 'play' | 'edit' | 'mixer' | 'library'
export type PlayMode = 'keys' | 'chords'
export type LibraryPane = 'ideas' | 'loops' | 'sounds'
export type SoundPickerMode = 'assign' | 'add'

interface MobileState {
  tab: MobileTab
  setTab: (tab: MobileTab) => void
  /** Pixels per beat in the arrangement. */
  trackZoom: number
  setTrackZoom: (zoom: number) => void
  /** Pixels per beat in the note editor. */
  editZoom: number
  setEditZoom: (zoom: number) => void
  /** Grid + new-note length in beats. */
  grid: number
  setGrid: (grid: number) => void
  playMode: PlayMode
  setPlayMode: (mode: PlayMode) => void
  libraryPane: LibraryPane
  setLibraryPane: (pane: LibraryPane) => void
  trackSheetId: string | null
  setTrackSheetId: (id: string | null) => void
  projectSheet: boolean
  setProjectSheet: (open: boolean) => void
  soundPicker: SoundPickerMode | null
  setSoundPicker: (mode: SoundPickerMode | null) => void
  selectedNoteId: string | null
  setSelectedNoteId: (id: string | null) => void
}

const read = (key: string, fallback: number, min: number, max: number) => {
  try {
    const value = Number(localStorage.getItem(key))
    return Number.isFinite(value) && value >= min && value <= max && value !== 0 ? value : fallback
  } catch {
    return fallback
  }
}

const write = (key: string, value: number) => {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    /* storage can be unavailable */
  }
}

export const TRACK_ZOOM = { min: 8, max: 64 }
export const EDIT_ZOOM = { min: 24, max: 200 }

export const useMobileStore = create<MobileState>((set) => ({
  tab: 'tracks',
  setTab: (tab) => set({ tab }),
  trackZoom: read('creer.m.trackZoom', 22, TRACK_ZOOM.min, TRACK_ZOOM.max),
  setTrackZoom: (zoom) => {
    const next = Math.round(clamp(zoom, TRACK_ZOOM.min, TRACK_ZOOM.max) * 10) / 10
    write('creer.m.trackZoom', next)
    set({ trackZoom: next })
  },
  editZoom: read('creer.m.editZoom', 72, EDIT_ZOOM.min, EDIT_ZOOM.max),
  setEditZoom: (zoom) => {
    const next = Math.round(clamp(zoom, EDIT_ZOOM.min, EDIT_ZOOM.max) * 10) / 10
    write('creer.m.editZoom', next)
    set({ editZoom: next })
  },
  grid: 0.5,
  setGrid: (grid) => set({ grid }),
  playMode: 'keys',
  setPlayMode: (playMode) => set({ playMode }),
  libraryPane: 'ideas',
  setLibraryPane: (libraryPane) => set({ libraryPane }),
  trackSheetId: null,
  setTrackSheetId: (trackSheetId) => set({ trackSheetId }),
  projectSheet: false,
  setProjectSheet: (projectSheet) => set({ projectSheet }),
  soundPicker: null,
  setSoundPicker: (soundPicker) => set({ soundPicker }),
  selectedNoteId: null,
  setSelectedNoteId: (selectedNoteId) => set({ selectedNoteId }),
}))
