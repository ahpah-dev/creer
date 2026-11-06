import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Repeat2, Trash2, X } from 'lucide-react'
import { useProjectStore } from '../store/project'
import { useSessionStore } from '../store/session'
import { getCurrentBeat, seekTo } from '../lib/transport'
import { SECTION_COLORS, SECTION_COLOR_NAMES, sectionColor } from '../data/sections'
import { formatBeatPosition } from '../lib/utils'

interface SectionEditorProps {
  sectionId: string
  x: number
  y: number
  onClose: () => void
}

export function SectionEditor({ sectionId, x, y, onClose }: SectionEditorProps) {
  const project = useProjectStore((state) => state.project)
  const updateProject = useProjectStore((state) => state.updateProject)
  const toast = useSessionStore((state) => state.toast)
  const section = project.sections.find((item) => item.id === sectionId) ?? null
  const [name, setName] = useState(section?.name ?? '')
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setName(section?.name ?? '')
    // Only sync the field when the editor moves to another section.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 20)
    return () => window.clearTimeout(timer)
  }, [sectionId])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (panelRef.current?.contains(event.target as Node)) return
      onClose()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  if (!section) return null

  const bars = Math.max(1, Math.round(section.length / project.timeSig))
  const color = sectionColor(section, project.sections.findIndex((item) => item.id === section.id))

  const commitName = (value: string) => {
    if (!value.trim()) {
      setName(section.name)
      return
    }
    updateProject(
      {
        sections: project.sections.map((item) =>
          item.id === section.id ? { ...item, name: value.trim() } : item,
        ),
      },
      { coalesce: `section-name:${section.id}` },
    )
  }

  const setColor = (value: string) => {
    updateProject({
      sections: project.sections.map((item) =>
        item.id === section.id ? { ...item, color: value } : item,
      ),
    })
  }

  const loopSection = () => {
    const end = section.start + section.length
    updateProject({ loop: { enabled: true, start: section.start, end } })
    if (getCurrentBeat() < section.start || getCurrentBeat() >= end) seekTo(section.start)
    toast('Section looping', `"${section.name}" will now repeat.`, 'success')
    onClose()
  }

  const remove = () => {
    if (project.sections.length <= 1) {
      toast('Keep one section', 'A song needs at least one section marker.', 'warn')
      return
    }
    updateProject({
      sections: project.sections.filter((item) => item.id !== section.id),
    })
    toast('Section removed', `"${section.name}" was removed from the ruler.`)
    onClose()
  }

  return createPortal(
    <div
      className="popover section-editor"
      ref={panelRef}
      style={{ left: x, top: y } as CSSProperties}
      role="dialog"
      aria-label={`Edit ${section.name}`}
    >
      <div className="section-editor-head">
        <div>
          <span className="eyebrow">SECTION</span>
          <strong>Edit marker</strong>
        </div>
        <button className="icon-button mini" onClick={onClose} aria-label="Close section editor">
          <X size={13} />
        </button>
      </div>

      <label className="section-name-field">
        <span className="field-label">NAME</span>
        <input
          ref={inputRef}
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            commitName(event.target.value)
          }}
          onBlur={() => commitName(name)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
          maxLength={30}
          spellCheck={false}
          aria-label="Section name"
        />
      </label>

      <div className="section-editor-meta">
        <span>Starts {formatBeatPosition(section.start, project.timeSig)}</span>
        <span>{bars} bars</span>
      </div>

      <div className="section-editor-row">
        <span className="field-label">COLOR</span>
        <div className="section-colors">
          {SECTION_COLORS.map((value, index) => (
            <button
              key={value}
              className={`section-color-swatch ${color === value ? 'is-active' : ''}`}
              style={{ background: value }}
              onClick={() => setColor(value)}
              aria-label={`Use ${SECTION_COLOR_NAMES[index]} for this section`}
              title={SECTION_COLOR_NAMES[index]}
            />
          ))}
        </div>
      </div>

      <div className="section-editor-actions">
        <button className="section-action" onClick={loopSection}>
          <Repeat2 size={13} /> Loop section
        </button>
        <button
          className="section-action is-danger"
          onClick={remove}
          disabled={project.sections.length <= 1}
        >
          <Trash2 size={13} /> Delete
        </button>
      </div>
    </div>,
    document.body,
  )
}
