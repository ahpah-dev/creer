import type { SwingSettings } from '../types'

/**
 * The second note of each swing pair is delayed by up to a third of the pair
 * interval. A full triplet feel is reached at 100%.
 */
export const swingOffset = (beat: number, swing: SwingSettings) => {
  if (!swing.enabled || swing.amount <= 0) return 0
  const pair = swing.division === 16 ? 0.5 : 1
  const withinPair = ((beat % pair) + pair) % pair
  // Only notes sitting on the pair's offbeat move. Straight notes, triplets
  // and finer in-between positions keep their original placement.
  if (Math.abs(withinPair - pair / 2) > pair * 0.125) return 0
  return (swing.amount / 100) * (pair / 6)
}

export const swungBeat = (beat: number, swing: SwingSettings) =>
  beat + swingOffset(beat, swing)
