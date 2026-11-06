import { create } from 'zustand'

export type MidiStatus = 'unsupported' | 'idle' | 'requesting' | 'ready' | 'denied' | 'error'

export interface MidiDeviceInfo {
  id: string
  name: string
  manufacturer: string
  state: MIDIPortDeviceState
}

interface MidiState {
  status: MidiStatus
  error: string | null
  devices: MidiDeviceInfo[]
  selectedId: string | null
  activeNotes: number[]
  setStatus: (status: MidiStatus) => void
  setError: (error: string | null) => void
  setDevices: (devices: MidiDeviceInfo[]) => void
  setSelectedId: (id: string | null) => void
  setActiveNotes: (notes: number[]) => void
}

const supported =
  typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function'

export const useMidiStore = create<MidiState>((set) => ({
  status: supported ? 'idle' : 'unsupported',
  error: null,
  devices: [],
  selectedId: null,
  activeNotes: [],
  setStatus: (status) => set({ status }),
  setError: (error) => set({ error }),
  setDevices: (devices) => set({ devices }),
  setSelectedId: (selectedId) => set({ selectedId }),
  setActiveNotes: (activeNotes) => set({ activeNotes }),
}))
