import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  CornerDownLeft,
  Download,
  HelpCircle,
  LayoutPanelTop,
  Music2,
  Pencil,
  Play,
  Plus,
  Search,
  SlidersHorizontal,
} from 'lucide-react'
import { buildCommands, scoreCommand, type Command, type CommandSection } from '../lib/commands'

const SECTION_ICONS: Record<CommandSection, typeof Plus> = {
  Create: Plus,
  Transport: Play,
  Edit: Pencil,
  Panels: LayoutPanelTop,
  Song: Music2,
  Project: Download,
  Help: HelpCircle,
}

const SECTION_ORDER: CommandSection[] = ['Create', 'Transport', 'Edit', 'Panels', 'Song', 'Project', 'Help']

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const results = useMemo<Command[]>(() => {
    const all = buildCommands(query)
    const trimmed = query.trim()
    if (!trimmed) {
      // The long lists (every sound, every key) only show up once you start typing.
      return all
        .filter((command) => !command.id.startsWith('track-') && !command.id.startsWith('key-') && !command.id.startsWith('snap-'))
        .sort((a, b) => SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section))
    }
    return all
      .map((command) => ({ command, score: command.id.endsWith('-dynamic') ? 100 : scoreCommand(command, trimmed) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 40)
      .map((item) => item.command)
  }, [query])

  useEffect(() => setActive(0), [query])

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active, results])

  const run = (command: Command | undefined) => {
    if (!command) return
    onClose()
    // Let the palette unmount first so commands that open modals are not swallowed.
    window.setTimeout(command.run, 0)
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((value) => Math.min(results.length - 1, value + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((value) => Math.max(0, value - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      run(results[active])
    } else if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }

  let lastSection: CommandSection | null = null
  const showHeadings = !query.trim()

  return createPortal(
    <div
      className="modal-backdrop palette-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette" onKeyDown={onKeyDown}>
        <div className="palette-search">
          <Search size={16} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search actions, sounds and settings — or type a tempo like 120"
            aria-label="Search commands"
            spellCheck={false}
            autoComplete="off"
          />
          <kbd>Esc</kbd>
        </div>
        <div className="palette-list" ref={listRef} role="listbox">
          {results.length === 0 && (
            <div className="palette-empty">
              <SlidersHorizontal size={18} />
              <strong>Nothing matches “{query}”</strong>
              <span>Try “add bass”, “export”, “mixer”, “key a minor” or a tempo.</span>
            </div>
          )}
          {results.map((command, index) => {
            const Icon = SECTION_ICONS[command.section]
            const heading = showHeadings && command.section !== lastSection
            lastSection = command.section
            return (
              <div key={command.id}>
                {heading && <div className="palette-heading">{command.section}</div>}
                <button
                  className={`palette-item ${index === active ? 'is-active' : ''}`}
                  role="option"
                  aria-selected={index === active}
                  data-active={index === active}
                  onMouseMove={() => setActive(index)}
                  onClick={() => run(command)}
                >
                  <span className="palette-item-icon">
                    <Icon size={14} />
                  </span>
                  <span className="palette-item-title">{command.title}</span>
                  {!showHeadings && <span className="palette-item-section">{command.section}</span>}
                  {command.hint && <kbd>{command.hint}</kbd>}
                </button>
              </div>
            )
          })}
        </div>
        <div className="palette-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>
              <CornerDownLeft size={10} />
            </kbd>{' '}
            run
          </span>
          <span className="palette-foot-grow">Every action in Creer lives here.</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
