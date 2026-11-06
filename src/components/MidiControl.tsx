import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Cable,
  Check,
  Loader2,
  Power,
  RefreshCw,
  X,
} from 'lucide-react'
import { midiToName } from '../lib/utils'
import {
  panicMidi,
  refreshMidiDevices,
  requestMidiAccess,
  selectMidiInput,
} from '../lib/midi'
import { useMidiStore } from '../store/midi'

export function MidiControl() {
  const status = useMidiStore((state) => state.status)
  const error = useMidiStore((state) => state.error)
  const devices = useMidiStore((state) => state.devices)
  const selectedId = useMidiStore((state) => state.selectedId)
  const activeNotes = useMidiStore((state) => state.activeNotes)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const connected = status === 'ready' && devices.length > 0
  const live = activeNotes.length > 0
  const selected = devices.find((device) => device.id === selectedId)

  return (
    <div className="midi-wrap" ref={wrapRef}>
      <button
        className={`midi-button ${connected ? 'is-connected' : ''} ${live ? 'is-live' : ''} ${status === 'denied' || status === 'error' ? 'is-error' : ''}`}
        onClick={() => setOpen(!open)}
        aria-label="MIDI input"
        aria-expanded={open}
        data-tip="MIDI keyboard"
      >
        <Cable size={15} />
        <span className="midi-button-label">MIDI</span>
        <i className="midi-status-dot" />
      </button>
      {open && (
        <div className="popover midi-popover">
          <div className="midi-pop-head">
            <div>
              <span className="eyebrow">MIDI IN</span>
              <strong>{connected ? 'Keyboard connected' : 'Connect a keyboard'}</strong>
            </div>
            <button className="icon-button mini" onClick={() => setOpen(false)} aria-label="Close MIDI panel">
              <X size={13} />
            </button>
          </div>

          {status === 'unsupported' && (
            <div className="midi-message">
              <AlertTriangle size={15} />
              <p>Web MIDI is not available in this browser. Try a current Chrome or Edge on desktop.</p>
            </div>
          )}

          {status === 'idle' && (
            <>
              <div className="midi-intro">
                <div className="midi-intro-icon"><Cable size={20} /></div>
                <p>
                  Plug in a MIDI keyboard, then allow Creer to listen. Notes play the armed track, or
                  your selected track when nothing is armed.
                </p>
              </div>
              <button className="button button-primary midi-enable" onClick={() => void requestMidiAccess()}>
                <Power size={14} /> Enable MIDI input
              </button>
            </>
          )}

          {status === 'requesting' && (
            <div className="midi-message">
              <Loader2 size={15} className="spin" />
              <p>Waiting for browser permission…</p>
            </div>
          )}

          {(status === 'denied' || status === 'error') && (
            <>
              <div className="midi-message is-error">
                <AlertTriangle size={15} />
                <p>{error ?? 'MIDI is unavailable right now.'}</p>
              </div>
              {typeof location !== 'undefined' && location.protocol === 'file:' && (
                <p className="midi-file-note">
                  MIDI permissions are most reliable in the hosted studio. Run <strong>Start Creer.bat</strong> and open the local address.
                </p>
              )}
              <button className="button button-secondary midi-enable" onClick={() => void requestMidiAccess()}>
                Try again
              </button>
            </>
          )}

          {status === 'ready' && (
            <>
              {devices.length > 0 ? (
                <div className="midi-device-list">
                  {devices.map((device) => (
                    <button
                      key={device.id}
                      className={`midi-device ${selectedId === device.id ? 'is-selected' : ''}`}
                      onClick={() => selectMidiInput(device.id)}
                    >
                      <span className="midi-device-radio">
                        {selectedId === device.id && <Check size={10} />}
                      </span>
                      <span className="midi-device-copy">
                        <strong>{device.name}</strong>
                        <em>{device.manufacturer || 'MIDI input'}</em>
                      </span>
                      <span className="midi-device-live"><i /> LIVE</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="midi-empty">
                  <Cable size={18} />
                  <p>No MIDI inputs detected. Plug in a keyboard, turn it on, then refresh.</p>
                </div>
              )}

              <div className="midi-live-row">
                <span className="field-label">INCOMING</span>
                <div className="midi-live-notes">
                  {activeNotes.length ? (
                    activeNotes.map((pitch) => <span key={pitch}>{midiToName(pitch)}</span>)
                  ) : (
                    <em>Waiting for notes…</em>
                  )}
                </div>
              </div>

              <div className="midi-footer">
                <button className="midi-text-button" onClick={() => refreshMidiDevices()}>
                  <RefreshCw size={11} /> Refresh
                </button>
                <button className="midi-text-button" onClick={panicMidi} disabled={!activeNotes.length}>
                  All notes off
                </button>
              </div>
              <p className="midi-tip">
                {selected ? `Playing through ${selected.name}.` : 'Choose an input to start playing.'} Incoming
                notes are captured while you record.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
