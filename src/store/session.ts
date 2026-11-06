import { create } from 'zustand'
import type { DockTab, Toast } from '../types'
import { clamp, uid } from '../lib/utils'

export type ModalType = 'help' | 'new' | 'export' | 'addTrack' | 'sounds' | 'idea' | null

interface SessionState {
  dock: DockTab
  setDock: (dock: DockTab) => void
  dockCollapsed: boolean
  setDockCollapsed: (collapsed: boolean) => void
  zoom: number
  setZoom: (zoom: number) => void
  pianoZoom: number
  setPianoZoom: (zoom: number) => void
  snap: number
  setSnap: (snap: number) => void
  noteLength: number
  setNoteLength: (length: number) => void
  isPlaying: boolean
  setPlaying: (playing: boolean) => void
  isRecording: boolean
  setRecording: (recording: boolean) => void
  metronome: boolean
  setMetronome: (metronome: boolean) => void
  pausedBeat: number
  setPausedBeat: (beat: number) => void
  selectedNoteIds: string[]
  setSelectedNoteIds: (ids: string[]) => void
  modal: ModalType
  setModal: (modal: ModalType) => void
  toasts: Toast[]
  toast: (title: string, detail?: string, tone?: Toast['tone']) => void
  dismissToast: (id: string) => void
  saveStatus: 'saved' | 'saving' | 'error'
  lastSavedAt: number | null
  setSaveStatus: (status: 'saved' | 'saving' | 'error') => void
  exporting: boolean
  setExporting: (exporting: boolean) => void
  keyboardOctave: number
  setKeyboardOctave: (octave: number) => void
  pianoTool: 'draw' | 'select'
  setPianoTool: (tool: 'draw' | 'select') => void
  effectsTarget: 'track' | 'master'
  setEffectsTarget: (target: 'track' | 'master') => void
  previewingLoop: string | null
  setPreviewingLoop: (id: string | null) => void
}

const readZoom = () => {
  try {
    const raw = Number(localStorage.getItem('creer.zoom'))
    return Number.isFinite(raw) && raw >= 8 && raw <= 56 ? raw : 18
  } catch {
    return 18
  }
}

const writeZoom = (value: number) => {
  try {
    localStorage.setItem('creer.zoom', String(value))
  } catch {
    /* storage can be unavailable in private or embedded contexts */
  }
}

const readPianoZoom = () => {
  try {
    const raw = Number(localStorage.getItem('creer.pianoZoom'))
    return Number.isFinite(raw) && raw >= 1 && raw <= 8 ? raw : 1
  } catch {
    return 1
  }
}

const writePianoZoom = (value: number) => {
  try {
    localStorage.setItem('creer.pianoZoom', String(value))
  } catch {
    /* storage can be unavailable in private or embedded contexts */
  }
}

export const useSessionStore = create<SessionState>((set, get) => ({
  dock: 'editor',
  setDock: (dock) =>
    set({
      dock,
      dockCollapsed: false,
      ...(dock !== 'editor' ? { selectedNoteIds: [] } : {}),
    }),
  dockCollapsed: false,
  setDockCollapsed: (dockCollapsed) => set({ dockCollapsed }),
  zoom: readZoom(),
  setZoom: (zoom) => {
    const next = clamp(zoom, 8, 56)
    writeZoom(next)
    set({ zoom: next })
  },
  pianoZoom: readPianoZoom(),
  setPianoZoom: (zoom) => {
    const next = Math.round(clamp(zoom, 1, 8) * 100) / 100
    writePianoZoom(next)
    set({ pianoZoom: next })
  },
  snap: 0.25,
  setSnap: (snap) => set({ snap }),
  noteLength: 1,
  setNoteLength: (noteLength) => set({ noteLength }),
  isPlaying: false,
  setPlaying: (isPlaying) => set({ isPlaying }),
  isRecording: false,
  setRecording: (isRecording) => set({ isRecording }),
  metronome: false,
  setMetronome: (metronome) => set({ metronome }),
  pausedBeat: 0,
  setPausedBeat: (pausedBeat) => set({ pausedBeat }),
  selectedNoteIds: [],
  setSelectedNoteIds: (selectedNoteIds) => set({ selectedNoteIds }),
  modal: null,
  setModal: (modal) => set({ modal }),
  toasts: [],
  toast: (title, detail, tone = 'default') => {
    const id = uid('toast')
    set({ toasts: [...get().toasts, { id, title, detail, tone }].slice(-3) })
    window.setTimeout(() => {
      set({ toasts: get().toasts.filter((toast) => toast.id !== id) })
    }, 3600)
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((toast) => toast.id !== id) }),
  saveStatus: 'saved',
  lastSavedAt: null,
  setSaveStatus: (saveStatus) => set({ saveStatus, ...(saveStatus === 'saved' ? { lastSavedAt: Date.now() } : {}) }),
  exporting: false,
  setExporting: (exporting) => set({ exporting }),
  keyboardOctave: 3,
  setKeyboardOctave: (keyboardOctave) => set({ keyboardOctave: clamp(keyboardOctave, 1, 5) }),
  pianoTool: 'draw',
  setPianoTool: (pianoTool) => set({ pianoTool }),
  effectsTarget: 'track',
  setEffectsTarget: (effectsTarget) => set({ effectsTarget }),
  previewingLoop: null,
  setPreviewingLoop: (previewingLoop) => set({ previewingLoop }),
}))
