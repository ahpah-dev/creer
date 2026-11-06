import { engine } from '../audio/engine'
import { useProjectStore } from '../store/project'
import { useSessionStore } from '../store/session'
import { useMidiStore, type MidiDeviceInfo } from '../store/midi'
import { captureNoteEnd, captureNoteStart } from './recording'

interface HeldNote {
  pitch: number
  voiceKey: string | null
  recordToken: string | null
  cancelled: boolean
}

let access: MIDIAccess | null = null
let selectedInput: MIDIInput | null = null
let requesting = false
let sustainDown = false
let windowListenersAttached = false
const heldNotes = new Map<number, HeldNote>()
const sustainedNotes = new Set<number>()

const syncActiveNotes = () => {
  useMidiStore.getState().setActiveNotes([...heldNotes.keys()].sort((a, b) => a - b))
}

const stopNote = (pitch: number) => {
  const note = heldNotes.get(pitch)
  if (!note) return
  heldNotes.delete(pitch)
  sustainedNotes.delete(pitch)
  note.cancelled = true
  if (note.voiceKey) engine.noteOff(note.voiceKey)
  captureNoteEnd(note.recordToken)
  syncActiveNotes()
}

const releaseAll = () => {
  for (const pitch of [...heldNotes.keys()]) stopNote(pitch)
  sustainedNotes.clear()
  sustainDown = false
}

const targetTrack = () => {
  const project = useProjectStore.getState().project
  return (
    project.tracks.find((track) => track.armed) ??
    project.tracks.find((track) => track.id === useProjectStore.getState().selectedTrackId) ??
    project.tracks[0] ??
    null
  )
}

const playNote = (pitch: number, velocity: number) => {
  const track = targetTrack()
  if (!track) return
  if (heldNotes.has(pitch)) stopNote(pitch)
  const note: HeldNote = {
    pitch,
    voiceKey: null,
    recordToken: useSessionStore.getState().isRecording ? captureNoteStart(pitch, velocity) : null,
    cancelled: false,
  }
  heldNotes.set(pitch, note)
  syncActiveNotes()
  void engine.noteOn(track.instrument, track.id, pitch, velocity).then((voiceKey) => {
    if (!voiceKey) return
    if (note.cancelled || !heldNotes.has(pitch)) {
      engine.noteOff(voiceKey)
    } else {
      note.voiceKey = voiceKey
    }
  })
}

const releaseNote = (pitch: number) => {
  if (!heldNotes.has(pitch)) return
  if (sustainDown) {
    sustainedNotes.add(pitch)
    return
  }
  stopNote(pitch)
}

const releaseSustained = () => {
  for (const pitch of [...sustainedNotes]) stopNote(pitch)
  sustainedNotes.clear()
}

const handleMessage = (event: MIDIMessageEvent) => {
  const data = event.data
  if (!data || data.length < 2) return
  const command = data[0] & 0xf0
  const pitch = data[1]

  if (command === 0x90 && (data[2] ?? 0) > 0) {
    playNote(pitch, Math.max(0.05, (data[2] ?? 100) / 127))
    return
  }
  if (command === 0x80 || (command === 0x90 && (data[2] ?? 0) === 0)) {
    releaseNote(pitch)
    return
  }
  if (command === 0xb0) {
    const controller = data[1]
    const value = data[2] ?? 0
    if (controller === 64) {
      sustainDown = value >= 64
      if (!sustainDown) releaseSustained()
    } else if (controller === 123) {
      releaseAll()
    }
    return
  }
  if (command === 0xe0) {
    // Pitch bend is intentionally not applied to the built-in voices; keeping the
    // performance musical is more useful than a half-supported bend.
    return
  }
}

const attachWindowListeners = () => {
  if (windowListenersAttached) return
  windowListenersAttached = true
  window.addEventListener('blur', () => releaseAll())
}

const detachInput = () => {
  if (selectedInput) selectedInput.onmidimessage = null
  selectedInput = null
}

const attachInput = (input: MIDIInput) => {
  detachInput()
  selectedInput = input
  selectedInput.onmidimessage = handleMessage
  void selectedInput.open?.().catch(() => undefined)
}

const refreshDevices = () => {
  if (!access) return
  const state = useMidiStore.getState()
  const devices: MidiDeviceInfo[] = [...access.inputs.values()]
    .filter((input) => input.state === 'connected')
    .map((input) => ({
      id: input.id,
      name: input.name || 'MIDI keyboard',
      manufacturer: input.manufacturer || '',
      state: input.state,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  state.setDevices(devices)
  if (!devices.length) {
    detachInput()
    state.setSelectedId(null)
    releaseAll()
    return
  }

  const current = selectedInput
  const preferred = devices.find((device) => device.id === state.selectedId)
  const next = current && devices.some((device) => device.id === current?.id)
    ? devices.find((device) => device.id === current?.id)!
    : preferred ?? devices[0]
  const input = access.inputs.get(next.id)
  if (input && input !== selectedInput) attachInput(input)
  state.setSelectedId(next.id)
}

const onStateChange = () => {
  releaseAll()
  refreshDevices()
}

const statusForError = (error: unknown): { status: 'denied' | 'error'; message: string } => {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return {
      status: 'denied',
      message: 'MIDI access was blocked. Allow MIDI in your browser’s site settings, then try again.',
    }
  }
  return {
    status: 'error',
    message: 'The MIDI connection could not be opened. Check the device and try again.',
  }
}

export const requestMidiAccess = async () => {
  const store = useMidiStore.getState()
  if (access) {
    store.setStatus('ready')
    refreshDevices()
    return
  }
  if (typeof navigator.requestMIDIAccess !== 'function') {
    store.setStatus('unsupported')
    return
  }
  if (requesting) return
  requesting = true
  store.setStatus('requesting')
  store.setError(null)
  try {
    access = await navigator.requestMIDIAccess({ sysex: false })
    access.onstatechange = onStateChange
    attachWindowListeners()
    refreshDevices()
    useMidiStore.getState().setStatus('ready')
  } catch (error) {
    const { status, message } = statusForError(error)
    useMidiStore.getState().setStatus(status)
    useMidiStore.getState().setError(message)
  } finally {
    requesting = false
  }
}

export const selectMidiInput = (id: string) => {
  if (!access) return
  const input = access.inputs.get(id)
  if (!input) return
  releaseAll()
  attachInput(input)
  useMidiStore.getState().setSelectedId(id)
  useMidiStore.getState().setError(null)
}

export const refreshMidiDevices = () => {
  if (!access) {
    void requestMidiAccess()
    return
  }
  refreshDevices()
}

export const panicMidi = () => {
  releaseAll()
}

export const midiInfo = () => ({
  hasAccess: Boolean(access),
  input: selectedInput?.name ?? null,
  sustainDown,
  held: [...heldNotes.keys()],
})
