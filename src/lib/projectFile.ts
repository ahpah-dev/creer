import { engine } from '../audio/engine'
import { downloadBlob, safeFilename } from '../audio/export'
import { useProjectStore } from '../store/project'
import { useSessionStore } from '../store/session'
import { stopRecording } from './recording'

/** Loads a Creer project (.json) from a file the user picked. */
export const importProjectFile = async (file: File) => {
  const session = useSessionStore.getState()
  try {
    const data = JSON.parse(await file.text())
    if (session.isRecording) stopRecording()
    engine.stop()
    session.setPlaying(false)
    session.setPausedBeat(0)
    session.setSelectedNoteIds([])
    useProjectStore.getState().replaceProject(data, { clearHistory: true })
    session.toast('Project imported', `"${data.name ?? file.name}" is ready to play.`, 'success')
  } catch {
    session.toast('Could not open that file', 'Choose a Creer project (.json) to import.', 'warn')
  }
}

/** Opens the system file picker and imports whatever project is chosen. */
export const openProjectPicker = () => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json,.creer,application/json'
  input.onchange = () => {
    const file = input.files?.[0]
    if (file) void importProjectFile(file)
  }
  input.click()
}

export const saveProjectCopy = () => {
  const project = useProjectStore.getState().project
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
  downloadBlob(blob, `${safeFilename(project.name)}.creer.json`)
  useSessionStore.getState().toast('Project saved to your computer', 'A .creer.json copy has been downloaded.', 'success')
}
