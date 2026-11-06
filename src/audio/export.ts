import type { Project } from '../types'
import { contentEnd } from '../lib/utils'
import { createMasterBus, createTrackBus } from './graph'
import { triggerNote } from './synth'

const SAMPLE_RATE = 44100

const writeString = (view: DataView, offset: number, value: string) => {
  for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i))
}

export const encodeWav = (buffer: AudioBuffer) => {
  const channels = Math.min(2, buffer.numberOfChannels)
  const frames = buffer.length
  const bytesPerSample = 2
  const blockAlign = channels * bytesPerSample
  const dataSize = frames * blockAlign
  const arrayBuffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(arrayBuffer)

  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, buffer.sampleRate, true)
  view.setUint32(28, buffer.sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)
  writeString(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  const left = buffer.getChannelData(0)
  const right = channels > 1 ? buffer.getChannelData(1) : left
  let offset = 44
  for (let i = 0; i < frames; i++) {
    const l = Math.max(-1, Math.min(1, left[i]))
    const r = Math.max(-1, Math.min(1, right[i]))
    view.setInt16(offset, l < 0 ? l * 0x8000 : l * 0x7fff, true)
    offset += 2
    if (channels > 1) {
      view.setInt16(offset, r < 0 ? r * 0x8000 : r * 0x7fff, true)
      offset += 2
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' })
}

export const renderProjectToWav = async (project: Project): Promise<{ blob: Blob; duration: number }> => {
  const spb = 60 / project.bpm
  const endBeat = Math.max(project.timeSig, contentEnd(project))
  const tail = 2.8
  const duration = Math.max(2, endBeat * spb + tail)
  const frames = Math.ceil(duration * SAMPLE_RATE)
  const ctx = new OfflineAudioContext(2, frames, SAMPLE_RATE)
  const master = createMasterBus(ctx, ctx.destination, project.master, project.bpm)
  const hasSolo = project.tracks.some((track) => track.solo)
  const startAt = 0.08

  for (const track of project.tracks) {
    const bus = createTrackBus(ctx, master, track)
    const audible = !track.mute && (!hasSolo || track.solo)
    if (!audible) {
      bus.fader.gain.value = 0
    }
    for (const clip of track.clips) {
      for (const note of clip.notes) {
        if (note.start < 0 || note.start >= clip.length - 1e-7) continue
        triggerNote(
          ctx,
          bus.input,
          track.instrument,
          note.pitch,
          startAt + (clip.start + note.start) * spb,
          Math.max(0.03, note.duration * spb),
          note.velocity,
        )
      }
    }
  }

  const rendered = await ctx.startRendering()
  const blob = encodeWav(rendered)
  return { blob, duration }
}

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10000)
}

export const safeFilename = (name: string) => {
  const cleaned = name.trim().replace(/[^a-z0-9\-\s_]/gi, '').replace(/\s+/g, '-')
  return cleaned || 'creer-song'
}
