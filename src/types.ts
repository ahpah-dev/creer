export type InstrumentId =
  | 'piano'
  | 'electric'
  | 'pad'
  | 'bass'
  | 'pluck'
  | 'bell'
  | 'strings'
  | 'organ'
  | 'marimba'
  | 'harp'
  | 'wurlitzer'
  | 'toy'
  | 'musicbox'
  | 'sub'
  | 'fretless'
  | 'aurora'
  | 'choir'
  | 'neon'
  | 'kalimba'
  | 'drums'
  | 'lofi'
  | 'hand'

export type InstrumentCategory = 'Keys' | 'Bass' | 'Pads' | 'Leads' | 'Drums'

export interface InstrumentInfo {
  id: InstrumentId
  name: string
  shortName: string
  category: InstrumentCategory
  description: string
  color: string
  isDrums?: boolean
}

export interface Note {
  id: string
  pitch: number
  /** beats, relative to the clip start */
  start: number
  /** beats */
  duration: number
  /** 0..1 */
  velocity: number
}

export interface Clip {
  id: string
  name: string
  /** absolute timeline position in beats */
  start: number
  /** length in beats */
  length: number
  notes: Note[]
}

export interface Track {
  id: string
  name: string
  instrument: InstrumentId
  color: string
  volume: number
  pan: number
  mute: boolean
  solo: boolean
  armed: boolean
  reverbSend: number
  delaySend: number
  clips: Clip[]
}

export interface Section {
  id: string
  name: string
  start: number
  length: number
  color?: string
}

export interface LoopSettings {
  enabled: boolean
  start: number
  end: number
}

export interface MasterSettings {
  volume: number
  reverb: number
  delay: number
}

export interface Project {
  version: 1
  id: string
  name: string
  bpm: number
  timeSig: number
  key: string
  scale: 'minor' | 'major'
  lengthBeats: number
  tracks: Track[]
  sections: Section[]
  loop: LoopSettings
  master: MasterSettings
  createdAt: string
  updatedAt: string
}

export interface LoopDef {
  id: string
  name: string
  description: string
  category: 'Beats' | 'Bass' | 'Chords' | 'Melody' | 'Texture'
  instrument: InstrumentId
  lengthBeats: number
  /** semitone offset relative to A minor demo source */
  color: string
  notes: Omit<Note, 'id'>[]
  tags: string[]
}

export interface DragState {
  clipId: string
  sourceTrackId: string
  mode: 'move' | 'resize-left' | 'resize-right'
  originX: number
  originY: number
  originalStart: number
  originalLength: number
  start: number
  length: number
  targetTrackId: string
  moved: boolean
}

export type SnapValue = number

export type DockTab = 'editor' | 'mixer' | 'loops' | 'keys'

export interface Toast {
  id: string
  title: string
  detail?: string
  tone?: 'default' | 'success' | 'warn'
}
