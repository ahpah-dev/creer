import { ChevronDown, ChevronUp, Keyboard, Library, Piano, SlidersHorizontal } from 'lucide-react'
import { getSelectedClip, useProjectStore } from '../store/project'
import { useSessionStore } from '../store/session'
import type { DockTab } from '../types'
import { PianoRoll } from './PianoRoll'
import { Mixer } from './Mixer'
import { LoopLibrary } from './LoopLibrary'
import { KeyboardPanel } from './KeyboardPanel'

const TABS: { id: DockTab; label: string; icon: typeof Piano }[] = [
  { id: 'editor', label: 'Piano Roll', icon: Piano },
  { id: 'mixer', label: 'Mixer', icon: SlidersHorizontal },
  { id: 'loops', label: 'Loops', icon: Library },
  { id: 'keys', label: 'Sounds & Keys', icon: Keyboard },
]

export function EditorDock() {
  const dock = useSessionStore((state) => state.dock)
  const setDock = useSessionStore((state) => state.setDock)
  const collapsed = useSessionStore((state) => state.dockCollapsed)
  const setCollapsed = useSessionStore((state) => state.setDockCollapsed)
  const project = useProjectStore((state) => state.project)
  const selectedClipId = useProjectStore((state) => state.selectedClipId)
  const selected = getSelectedClip(project, selectedClipId)
  const track = selected?.track
  const context =
    dock === 'editor'
      ? selected
        ? selected.clip.name
        : 'No clip selected'
      : dock === 'mixer'
        ? `${project.tracks.length} channels · master`
        : dock === 'loops'
          ? 'Curated starting points'
          : 'Play live · record ideas'

  return (
    <section className={`editor-dock ${collapsed ? 'is-collapsed' : ''}`} aria-label="Editor">
      <div className="dock-tabs">
        <div className="dock-tab-list" role="tablist" aria-label="Studio editors">
          {TABS.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                className={`dock-tab ${dock === tab.id && !collapsed ? 'is-active' : ''}`}
                role="tab"
                aria-selected={dock === tab.id && !collapsed}
                onClick={() => {
                  setDock(tab.id)
                }}
              >
                <Icon size={15} />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>
        <div className="dock-context">
          {track && dock === 'editor' && (
            <span className="dock-track-pill">
              <i style={{ background: track.color }} />
              {track.name}
            </span>
          )}
          <span className="dock-context-text">{context}</span>
          <button
            className="icon-button mini dock-collapse"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand editor' : 'Collapse editor'}
            data-tip={collapsed ? 'Expand editor' : 'Collapse editor'}
          >
            {collapsed ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="dock-body">
          {dock === 'editor' && <PianoRoll />}
          {dock === 'mixer' && <Mixer />}
          {dock === 'loops' && <LoopLibrary />}
          {dock === 'keys' && <KeyboardPanel />}
        </div>
      )}
    </section>
  )
}
