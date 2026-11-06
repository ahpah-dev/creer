import {
  ChevronDown,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Minus,
  Plus,
  Scissors,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useProjectStore, getSelectedClip } from '../store/project'
import { useSessionStore } from '../store/session'
import { MOD_LABEL, SNAP_OPTIONS, projectEnd } from '../lib/utils'
import { duplicateSelectedClip, splitSelectedClip } from '../lib/clips'
import { copySelectedClips, pasteClipboard } from '../lib/clipboard'

export function Toolbar() {
  const project = useProjectStore((state) => state.project)
  const selectedClipId = useProjectStore((state) => state.selectedClipId)
  const selectedClipIds = useProjectStore((state) => state.selectedClipIds)
  const deleteClips = useProjectStore((state) => state.deleteClips)
  const selected = getSelectedClip(project, selectedClipId)
  const zoom = useSessionStore((state) => state.zoom)
  const setZoom = useSessionStore((state) => state.setZoom)
  const snap = useSessionStore((state) => state.snap)
  const setSnap = useSessionStore((state) => state.setSnap)
  const setModal = useSessionStore((state) => state.setModal)
  const toast = useSessionStore((state) => state.toast)
  const bars = Math.ceil(projectEnd(project) / project.timeSig)

  return (
    <div className="toolbar">
      <div className="toolbar-left">
        <button className="new-track-button" onClick={() => setModal('addTrack')} aria-label="New track" data-tip="New track  T">
          <span className="new-track-plus">
            <Plus size={15} strokeWidth={2} />
          </span>
          <span>New track</span>
          <span className="key-hint">T</span>
        </button>
        <div className="toolbar-separator" />
        <label className="select-control" data-tip="Timeline grid">
          <span className="select-label">SNAP</span>
          <span className="select-value">{SNAP_OPTIONS.find((option) => option.value === snap)?.label ?? '1/16'}</span>
          <select
            value={snap}
            onChange={(event) => setSnap(Number(event.target.value))}
            aria-label="Snap grid"
          >
            {SNAP_OPTIONS.map((option) => (
              <option key={option.label} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown size={12} className="select-chevron" />
        </label>
        <div className="toolbar-separator" />
        <div className="edit-tools">
          <button
            className="text-button"
            onClick={splitSelectedClip}
            disabled={!selected}
            data-tip="Split selected clip at the playhead"
            aria-label="Split selected clip at the playhead"
          >
            <Scissors size={14} />
            <span>Split</span>
          </button>
          <button
            className="text-button"
            onClick={duplicateSelectedClip}
            disabled={!selected}
            data-tip={`Duplicate selected clip  ${MOD_LABEL}+D`}
            aria-label="Duplicate selected clip"
          >
            <CopyPlus size={14} />
            <span>Duplicate</span>
          </button>
          <button
            className="text-button"
            onClick={() => copySelectedClips()}
            disabled={!selectedClipIds.length && !selected}
            data-tip={`Copy selected clips  ${MOD_LABEL}+C`}
            aria-label="Copy selected clips"
          >
            <Copy size={14} />
            <span>Copy</span>
          </button>
          <button
            className="text-button"
            onClick={() => pasteClipboard('clips')}
            data-tip={`Paste clips at the playhead  ${MOD_LABEL}+V`}
            aria-label="Paste clips at the playhead"
          >
            <ClipboardPaste size={14} />
            <span>Paste</span>
          </button>
          <button
            className="icon-button compact"
            onClick={() => {
              const ids = selectedClipIds.length
                ? selectedClipIds
                : selected
                  ? [selected.clip.id]
                  : []
              if (!ids.length) return
              deleteClips(ids)
              toast(
                `${ids.length} clip${ids.length === 1 ? '' : 's'} deleted`,
                `${MOD_LABEL}Z brings ${ids.length === 1 ? 'it' : 'them'} back.`,
              )
            }}
            disabled={!selectedClipIds.length && !selected}
            aria-label="Delete selected clips"
            data-tip="Delete selected clips  ⌫"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="toolbar-right">
        <div className="timeline-length">
          <span>{bars}</span> bars
        </div>
        <div className="toolbar-separator" />
        <div className="zoom-control">
          <ZoomOut size={13} className="zoom-icon" />
          <button
            className="zoom-step"
            onClick={() => setZoom(zoom - 2)}
            aria-label="Zoom out"
          >
            <Minus size={12} />
          </button>
          <input
            type="range"
            min={8}
            max={48}
            step={1}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            aria-label="Timeline zoom"
            style={{ ['--range-progress' as string]: `${((zoom - 8) / 40) * 100}%` }}
          />
          <button
            className="zoom-step"
            onClick={() => setZoom(zoom + 2)}
            aria-label="Zoom in"
          >
            <ZoomIn size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}
