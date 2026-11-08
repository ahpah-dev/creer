import { getSelectedClip, projectStats, useProjectStore } from '../store/project'
import { useSessionStore } from '../store/session'
import { MOD_LABEL } from '../lib/utils'

export function StatusBar() {
  const project = useProjectStore((state) => state.project)
  const selectedClipId = useProjectStore((state) => state.selectedClipId)
  const isPlaying = useSessionStore((state) => state.isPlaying)
  const isRecording = useSessionStore((state) => state.isRecording)
  const dock = useSessionStore((state) => state.dock)
  const noteCount = useSessionStore((state) => state.selectedNoteIds.length)
  const selected = getSelectedClip(project, selectedClipId)
  const stats = projectStats(project)
  const key = `${project.key} ${project.scale === 'minor' ? 'minor' : 'major'}`

  return (
    <footer className="status-bar">
      <div className="status-left">
        <span className={`audio-indicator ${isRecording ? 'is-recording' : isPlaying ? 'is-live' : ''}`}>
          <i />
          {isRecording ? 'Recording' : isPlaying ? 'Playing' : 'Audio ready'}
        </span>
        <span className="status-divider" />
        <span>{stats.tracks} tracks</span>
        <span className="status-dot">·</span>
        <span>{stats.clips} clips</span>
        <span className="status-dot">·</span>
        <span>{stats.notes} notes</span>
      </div>
      <div className="status-center">
        {isRecording ? (
          <span>Recording — play your keyboard or MIDI device · press <kbd>R</kbd> to stop</span>
        ) : dock === 'editor' && noteCount > 0 ? (
          <span>
            {noteCount} note{noteCount === 1 ? '' : 's'} selected · <kbd>←</kbd><kbd>→</kbd> nudge · <kbd>↑</kbd><kbd>↓</kbd> pitch · <kbd>⌫</kbd> delete
          </span>
        ) : selected ? (
          <>
            <span className="status-colored-dot" style={{ background: selected.track.color }} />
            <span>{selected.track.name}</span>
            <span className="status-chevron">/</span>
            <span>{selected.clip.name}</span>
            <span className="status-chevron">·</span>
            <span><kbd>Enter</kbd> edit notes · right-click for more</span>
          </>
        ) : (
          <span>Double-click a lane to create a clip · press <kbd>{MOD_LABEL}K</kbd> to search every action</span>
        )}
      </div>
      <div className="status-right">
        <span>{key}</span>
        <span className="status-dot">·</span>
        <span>{project.bpm} BPM</span>
        <span className="status-dot">·</span>
        <span>{project.timeSig}/4</span>
        <span className="status-divider" />
        <span className="space-hint"><kbd>Space</kbd> {isPlaying ? 'stop' : 'play'}</span>
      </div>
    </footer>
  )
}
