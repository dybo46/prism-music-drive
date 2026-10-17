import type { MelodyEvent } from './melody';
import { eventIndex, type SongEvent } from './song-map';
export type CueKind = 'meteor' | 'aurora' | 'fireworks' | 'portal' | 'comet' | 'prism' | 'airplane';
export interface VisualCue extends SongEvent {
  skyX?: number;
  skyScale?: number;
  kind: CueKind;
  duration: number;
  seed: number;
  reason: 'breakdown' | 'kick-return' | 'timbre-change' | 'melody-phrase';
}
// Randomness chooses the design, never the time or whether an audio event exists.
export function directSong(
  kicks: SongEvent[],
  changes: SongEvent[],
  energy: Float32Array,
  brightness: Float32Array,
  step: number,
  duration: number,
  melody: MelodyEvent[] = [],
) {
  let seed = 2166136261;
  for (let i = 0; i < energy.length; i += 37)
    seed = Math.imul(seed ^ Math.round(energy[i] * 997 + brightness[i] * 313), 16777619) >>> 0;
  const signature = seed;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const cues: VisualCue[] = [];
  const value = (a: Float32Array, t: number) =>
    a[Math.max(0, Math.min(a.length - 1, Math.round(t / step)))] ?? 0;
  for (let i = 1; i < kicks.length; i++) {
    const before = kicks[i - 1],
      after = kicks[i],
      gap = after.time - before.time;
    if (gap < 2.8 || eventIndex(kicks, before.time + 0.01) - eventIndex(kicks, before.time - 3) < 4)
      continue;
    const start = before.time + 0.6,
      length = gap - 0.6;
    if (value(energy, start + length / 2) < 0.035) continue; // A silent gap is not a musical breakdown.
    const choice = random();
    const kind: CueKind = choice < 0.4 ? 'meteor' : choice < 0.78 ? 'aurora' : 'comet';
    cues.push({
      time: start,
      strength: 0.5 + value(brightness, start) * 0.5,
      kind,
      duration: Math.min(14, length),
      seed,
      reason: 'breakdown',
    });
    // Returning bass is a distinct event; some tracks get no fireworks at all.
    if (random() < 0.78)
      cues.push({
        time: after.time,
        strength: after.strength,
        kind: random() < 0.6 ? 'fireworks' : 'prism',
        duration: 3.5,
        seed,
        reason: 'kick-return',
      });
  }
  for (const event of changes) {
    if (
      event.time < 2 ||
      event.time > duration - 1 ||
      cues.some((c) => Math.abs(c.time - event.time) < 4)
    )
      continue;
    if (random() > 0.65) continue;
    cues.push({
      ...event,
      kind: random() < 0.55 ? 'portal' : 'comet',
      duration: 4,
      seed,
      reason: 'timbre-change',
    });
  }
  let lastPhrase = -12;
  for (let i = 1; i < melody.length; i++) {
    const note = melody[i],
      previous = melody[i - 1];
    const leap = Math.abs(note.midi - previous.midi);
    if (
      note.time < 3 ||
      note.time - lastPhrase < 9 ||
      note.strength < 0.32 ||
      (leap < 5 && note.time - previous.time - previous.duration < 0.7)
    )
      continue;
    lastPhrase = note.time;
    const choice = random();
    // Musical phrases, not every note: allow the sky to remain spacious.
    if (cues.some((c) => Math.abs(c.time - note.time) < 3)) continue;
    cues.push({
      ...note,
      kind:
        choice < 0.36
          ? 'airplane'
          : choice < 0.7
            ? 'fireworks'
            : choice < 0.87
              ? 'meteor'
              : 'comet',
      duration: choice < 0.36 ? 8 : choice < 0.7 ? 4.5 : 7,
      seed,
      reason: 'melody-phrase',
    });
  }
  cues.sort((a, b) => a.time - b.time);
  return { cues, signature };
}
