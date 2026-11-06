import { engine } from '../audio/engine'
import { createMasterBus, createTrackBus } from '../audio/graph'
import { triggerNote } from '../audio/synth'
import { renderProjectToWav } from '../audio/export'
import { midiInfo } from './midi'
import { useProjectStore } from '../store/project'
import { useSessionStore } from '../store/session'
import { useMidiStore } from '../store/midi'

declare global {
  interface Window {
    __creer?: {
      engine: typeof engine
      projectStore: typeof useProjectStore
      sessionStore: typeof useSessionStore
      createMasterBus: typeof createMasterBus
      createTrackBus: typeof createTrackBus
      triggerNote: typeof triggerNote
      renderProjectToWav: typeof renderProjectToWav
      midiStore: typeof useMidiStore
      midiInfo: typeof midiInfo
    }
  }
}

export const exposeDebugApi = () => {
  window.__creer = {
    engine,
    projectStore: useProjectStore,
    sessionStore: useSessionStore,
    createMasterBus,
    createTrackBus,
    triggerNote,
    renderProjectToWav,
    midiStore: useMidiStore,
    midiInfo,
  }
}
