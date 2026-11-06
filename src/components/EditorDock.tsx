import { useEffect, useRef, useState } from 'react'
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import {
  ChevronDown,
  ChevronUp,
  Keyboard,
  Library,
  Piano,
  SlidersHorizontal,
  Wand2,
} from 'lucide-react'
import { getSelectedClip, useProjectStore } from '../store/project'
import { useSessionStore } from '../store/session'
import type { DockTab } from '../types'
import { clamp } from '../lib/utils'
import { PianoRoll } from './PianoRoll'
import { Mixer } from './Mixer'
import { LoopLibrary } from './LoopLibrary'
import { KeyboardPanel } from './KeyboardPanel'
import { EffectsPanel } from './EffectsPanel'

const MIN_DOCK_HEIGHT = 190
const MIN_ARRANGEMENT_HEIGHT = 160
const DOCK_HEIGHT_KEY = 'creer.dockHeight'

const readDockHeight = (): number | null => {
  try {
    const raw = Number(localStorage.getItem(DOCK_HEIGHT_KEY))
    return Number.isFinite(raw) && raw >= MIN_DOCK_HEIGHT && raw <= 1000 ? raw : null
  } catch {
    return null
  }
}

const writeDockHeight = (height: number) => {
  try {
    localStorage.setItem(DOCK_HEIGHT_KEY, String(Math.round(height)))
  } catch {
    /* storage can be unavailable in private or embedded contexts */
  }
}

const clearDockHeight = () => {
  try {
    localStorage.removeItem(DOCK_HEIGHT_KEY)
  } catch {
    /* storage can be unavailable in private or embedded contexts */
  }
}

const TABS: { id: DockTab; label: string; icon: typeof Piano }[] = [
  { id: 'editor', label: 'Piano Roll', icon: Piano },
  { id: 'mixer', label: 'Mixer', icon: SlidersHorizontal },
  { id: 'effects', label: 'Effects', icon: Wand2 },
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
  const selectedTrackId = useProjectStore((state) => state.selectedTrackId)
  const effectsTarget = useSessionStore((state) => state.effectsTarget)
  const selected = getSelectedClip(project, selectedClipId)
  const track = selected?.track ?? project.tracks.find((item) => item.id === selectedTrackId)
  const effectCount =
    effectsTarget === 'master' ? project.master.effects.length : (track?.effects.length ?? 0)
  const dockRef = useRef<HTMLElement>(null)
  const resizeDrag = useRef<{
    startY: number
    startHeight: number
    currentHeight: number
  } | null>(null)
  const [dockHeight, setDockHeight] = useState<number | null>(() => readDockHeight())
  const [maxDockHeight, setMaxDockHeight] = useState(900)
  const [resizing, setResizing] = useState(false)

  useEffect(() => {
    const workspace = dockRef.current?.parentElement
    if (!workspace) return
    const measure = () => {
      const max = Math.max(
        MIN_DOCK_HEIGHT,
        workspace.clientHeight - MIN_ARRANGEMENT_HEIGHT,
      )
      setMaxDockHeight(max)
      setDockHeight((current) => (current === null ? null : Math.min(current, max)))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(workspace)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    return () => {
      document.body.classList.remove('is-dock-resizing')
    }
  }, [])

  const commitDockHeight = (height: number) => {
    const next = Math.round(clamp(height, MIN_DOCK_HEIGHT, maxDockHeight))
    setDockHeight(next)
    return next
  }

  const resetDockHeight = () => {
    clearDockHeight()
    setDockHeight(null)
  }

  const nudgeDockHeight = (delta: number) => {
    const current = dockRef.current?.getBoundingClientRect().height ?? dockHeight ?? 314
    const next = commitDockHeight(current + delta)
    writeDockHeight(next)
  }

  const beginResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const height = dockRef.current?.getBoundingClientRect().height ?? 314
    resizeDrag.current = {
      startY: event.clientY,
      startHeight: height,
      currentHeight: height,
    }
    setResizing(true)
    event.currentTarget.setPointerCapture(event.pointerId)
    document.body.classList.add('is-dock-resizing')
  }

  const moveResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = resizeDrag.current
    if (!drag) return
    const next = commitDockHeight(drag.startHeight + drag.startY - event.clientY)
    drag.currentHeight = next
  }

  const endResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = resizeDrag.current
    if (!drag) return
    resizeDrag.current = null
    setResizing(false)
    document.body.classList.remove('is-dock-resizing')
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (Math.abs(event.clientY - drag.startY) > 1) {
      writeDockHeight(drag.currentHeight)
    }
  }

  const onResizeKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      nudgeDockHeight(event.key === 'ArrowUp' ? 18 : -18)
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      resetDockHeight()
    }
  }
  const context =
    dock === 'editor'
      ? selected
        ? selected.clip.name
        : 'No clip selected'
      : dock === 'mixer'
        ? `${project.tracks.length} channels · master`
        : dock === 'effects'
          ? `${effectsTarget === 'master' ? 'Master' : (track?.name ?? 'No track')} · ${effectCount} insert${effectCount === 1 ? '' : 's'}`
          : dock === 'loops'
            ? 'Curated starting points'
            : 'Play live · record ideas'

  return (
    <section
      ref={dockRef}
      className={`editor-dock ${collapsed ? 'is-collapsed' : ''} ${resizing ? 'is-resizing' : ''}`}
      aria-label="Editor"
      style={!collapsed && dockHeight !== null ? { height: `${dockHeight}px` } : undefined}
    >
      {!collapsed && (
        <div
          className="dock-resize-handle"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize editor height"
          aria-valuemin={MIN_DOCK_HEIGHT}
          aria-valuemax={Math.round(maxDockHeight)}
          aria-valuenow={dockHeight === null ? undefined : Math.round(dockHeight)}
          tabIndex={0}
          title="Drag to resize the editor · double-click to reset"
          onPointerDown={beginResize}
          onPointerMove={moveResize}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          onLostPointerCapture={() => {
            if (!resizeDrag.current) return
            resizeDrag.current = null
            setResizing(false)
            document.body.classList.remove('is-dock-resizing')
          }}
          onDoubleClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            resetDockHeight()
          }}
          onKeyDown={onResizeKeyDown}
        >
          <span aria-hidden="true" />
        </div>
      )}
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
                aria-label={tab.label}
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
          {dock === 'effects' && <EffectsPanel />}
          {dock === 'loops' && <LoopLibrary />}
          {dock === 'keys' && <KeyboardPanel />}
        </div>
      )}
    </section>
  )
}
