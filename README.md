# Creer

**A warm, fast digital audio workstation for the web.** Make a beat, hum a melody, borrow a loop and turn it into a song — all in the browser, with no account and no upload.

**Play online:** [**ahpah-dev.github.io/creer**](https://ahpah-dev.github.io/creer/)

![Creer studio](screenshots/studio.png)

## Open it

### Play online

Open **[ahpah-dev.github.io/creer](https://ahpah-dev.github.io/creer/)**. The site is served over HTTPS, so Web MIDI permissions are available directly in the browser.

### The quick way

[**Download Creer.html**](https://github.com/ahpah-dev/creer/releases/latest/download/Creer.html) from the latest release and double-click it. It is a self-contained build of the whole studio: all of the code, fonts and artwork are inside one file. No install, no server.

> Your projects are stored in the browser's local storage for that file. Use **Project menu → Save a copy** to keep a `.creer.json` backup.

### Start the development studio

Double-click **`Start Creer.bat`**, or run:

```bash
npm install
npm run dev
```

Then open the local address that Vite prints.

To produce the packed file again:

```bash
npm run build:standalone
```

That writes `standalone/index.html`, the finished `Creer.html`, and the GitHub Pages copy at `docs/index.html`.

## What is inside

- **Six-track demo song, “Golden Hour”** — play it immediately, solo parts, or pull it apart to learn how it was built.
- **Piano-roll editor** — draw, drag, resize and nudge notes, change velocity, quantize, transpose, split clips, and edit drum patterns by drum name. Drag a note up or down and you hear each new pitch as it moves. Zoom in from 100% to 800% with the − / + controls, or hold Ctrl/⌘ and scroll to zoom around the pointer.
- **Instrument library** — 22 synthesized sounds across Keys, Bass, Pads, Leads and Drums. Search or filter the collection, audition any sound, load it onto the current track with one click, or grow a new track from it.
- **The sounds** — from Velvet Piano, Gilded Harp and Red Room Wurli to Deep End, Fretless, Aurora, Dust Choir, Neon Lead, Kalimba and the dust-edged Lo-Fi Kit. Every one is built from oscillators, filters, FM and noise.
- **Live MIDI-style recording** — arm a track, hit record and play the keys or pads. Captured takes land in the arrangement.
- **MIDI keyboard input** — connect a hardware keyboard through the MIDI button in the top bar. Note on/off, velocity, sustain and hot-plugging are supported, and incoming MIDI is captured while recording.
- **Loop library** — ten curated, tempo-aware parts that preview and drop into the song.
- **Mixer** — per-track faders, pans, reverb/delay sends, mute/solo and meters, plus a master strip with its own effects and limiter.
- **Arrangement tools** — drag clips across tracks, resize them, loop sections, scrub the timeline, zoom, snap, duplicate, split and undo. Song sections are yours: rename and recolor them from the pencil, add new ones with **+**, or delete them.
- **WAV export** — offline-rendered stereo 44.1 kHz / 16-bit master, with all effects and the reverb tail.
- **Local-first workflow** — autosaves to the browser, exports/imports project files, and makes a copy with one click.

The audio is synthesised live with Web Audio. There are no samples or external audio assets.

> **New in 1.2** — piano-roll zoom with fit-to-width and cursor-anchored Ctrl/⌘ + scroll. The 1.1 release added the 22-sound instrument library with search and auditions, live pitch feedback while dragging notes, and song sections you can rename, recolor, add and remove.

## A look inside

### Piano-roll zoom
![Creer piano-roll zoom](screenshots/piano-zoom.png)

### Instrument library
![Creer instrument library](screenshots/library.png)

### Song sections
![Creer section editor](screenshots/section-editor.png)

### Mixer
![Creer mixer](screenshots/mixer.png)

### Loop library
![Creer loop library](screenshots/loops.png)

### Sounds & Keys
![Creer keyboard](screenshots/keys.png)

## A short tour

| Area | What to do |
| --- | --- |
| Transport | `Space` plays and pauses. `L` toggles the loop. `R` starts/stops a take. |
| Arrangement | Double-click an empty lane for a new clip. Double-click a clip to open its editor. Hover a section and use the pencil to rename, recolor, loop or delete it; **+** adds a section. |
| Piano roll | Click to draw, drag to move, use the right handle to resize. Moving a note up or down auditions the new pitch. Zoom with the − / + control or Ctrl/⌘ + scroll; click the percentage to fit. The lower lane edits velocity. |
| Instrument library | Open **Sounds & Keys** and click the sound name (or **Browse**). Search, audition, then click a card to load it on the current track. |
| Recording | Arm a track with the dot in its header, press record, then play the on-screen keys or pads. |
| Loops | Open the **Loops** tab, preview with the play button, add with **Add**. |
| Mixer | Faders, pan, reverb/delay sends and master effects. Double-click a knob to reset it to its natural centre. |
| MIDI | Click **MIDI** in the top bar, enable input and choose your keyboard. It plays the armed track (or the selected track if none is armed). |
| Export | **Export** renders the full arrangement to a WAV. Loop settings are not applied to the bounce. |

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Space` | Play / pause |
| `Ctrl/⌘ + Z` | Undo |
| `Ctrl/⌘ + Shift + Z` | Redo |
| `Ctrl/⌘ + D` | Duplicate selected clip |
| `Ctrl/⌘ + A` | Select all notes in the open clip |
| `Delete / Backspace` | Delete selected notes, or the selected clip |
| `R` | Record a take |
| `L` | Toggle loop |
| `M` / `S` | Mute / solo the selected track |
| `T` | New track |
| `1` – `4` | Switch editors |
| `Arrow keys` | Seek by bar; nudge selected notes |
| `A` – `K` | Musical typing (when Sounds & Keys is open) |
| `Z` / `X` | Octave down / up (keyboard) |
| `Alt + drag` | Move without snapping |
| `?` | Open help |

## Under the hood

- **React 19 + TypeScript + Vite.**
- A custom Web Audio engine with a lookahead beat scheduler, per-track bus, pans, sends, convolution reverb and tempo-synced delay.
- Synthesis voices built from oscillators, filters, FM and noise — no sample files.
- OfflineAudioContext bounce → 16-bit PCM WAV encoder.
- Zustand state with an undo history, coalesced slider gestures, and debounced localStorage persistence.
- A single-file build that inlines the compiled app, fonts and favicon.

## MIDI keyboards

![Creer MIDI input](screenshots/midi-panel.png)

1. Click the **MIDI** button in the top bar.
2. Choose **Enable MIDI input** and allow MIDI access when your browser asks.
3. Select your keyboard from the list. The green dot means it is live.

Incoming notes play through the **armed** track, falling back to the selected track. If you are recording, the notes and velocities are written into the take. Sustain (CC64), hot-plugging and “all notes off” are handled. If you are using the standalone file and the browser blocks MIDI permissions, run `Start Creer.bat` and use the localhost version instead — MIDI permissions are most reliable there.

## Notes & scope

- Creer is built and tested in a current Chrome/Chromium browser, which is recommended. It uses modern Web Audio, Web MIDI and CSS features. Audio starts after your first click (a browser requirement).
- This is a **synthesis-first** studio: it records MIDI-style performances from hardware and on-screen instruments rather than microphone audio.
- A full-song export renders offline and can take 20–40 seconds depending on the song and machine. The export dialog keeps you posted.
- Everything is generated locally. Nothing is uploaded anywhere.

## License

**Unlicense** — this is free and unencumbered software released into the public domain. See [LICENSE](LICENSE).

Source: [github.com/ahpah-dev/creer](https://github.com/ahpah-dev/creer)

Made for making something.
