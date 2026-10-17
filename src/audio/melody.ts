import type { SongEvent } from './song-map';
export interface MelodyEvent extends SongEvent {
  midi: number;
  frequency: number;
  duration: number;
  confidence: number;
}
// Dominant harmonic contour, not instrument separation. Only stable tonal evidence emits notes.
export class MelodyTracker {
  private powers = new Float32Array(1024);
  private pending?: {
    midi: number;
    time: number;
    strength: number;
    confidence: number;
    frames: number;
  };
  private active?: MelodyEvent;
  readonly events: MelodyEvent[] = [];
  process(left: Float32Array, right: Float32Array, sr: number, time: number) {
    let band = 0;
    for (let i = 0; i < left.length; i++) {
      this.powers[i] = left[i] ** 2 + right[i] ** 2;
      if ((i * sr) / 2048 >= 180 && (i * sr) / 2048 <= 5000) band += this.powers[i];
    }
    let best = 0,
      bestMidi = 0,
      contrast = 0;
    for (let midi = 54; midi <= 90; midi++) {
      const frequency = 440 * 2 ** ((midi - 69) / 12);
      let score = 0,
        localContrast = 0;
      for (let h = 1; h <= 4; h++) {
        const bin = Math.round((frequency * h * 2048) / sr);
        if (bin + 4 >= left.length) break;
        const peak = Math.max(this.powers[bin - 1], this.powers[bin], this.powers[bin + 1]);
        const floor = (this.powers[bin - 4] + this.powers[bin + 4]) * 0.5;
        score += Math.max(0, peak - floor) / (h * h);
        localContrast += peak / (peak + floor + 1e-12) / (h * h);
      }
      if (score > best) {
        best = score;
        bestMidi = midi;
        contrast = localContrast / 1.4236;
      }
    }
    const confidence = Math.min(1, (best / Math.max(1e-12, band)) * 4);
    const valid = band > 1e-5 && best / band > 0.055 && contrast > 0.72;
    const midi = valid ? bestMidi : 0;
    if (this.pending?.midi === midi) {
      this.pending.frames++;
      this.pending.strength = Math.max(this.pending.strength, Math.sqrt(best));
    } else this.pending = { midi, time, strength: Math.sqrt(best), confidence, frames: 1 };
    // About 80 ms of consistent pitch prevents hats/noise from becoming scenery notes.
    if (this.pending.frames < 4) return;
    if (this.active?.midi === midi) return;
    this.close(this.pending.time);
    if (valid)
      this.active = {
        time: this.pending.time,
        midi,
        frequency: 440 * 2 ** ((midi - 69) / 12),
        duration: 0,
        strength: this.pending.strength,
        confidence: this.pending.confidence,
      };
  }
  private close(time: number) {
    if (this.active) {
      this.active.duration = time - this.active.time;
      if (this.active.duration >= 0.1) this.events.push(this.active);
      this.active = undefined;
    }
  }
  finish(duration: number, attacks: SongEvent[]) {
    this.close(duration);
    // A new measured attack may rearticulate the same pitch; no artificial beat subdivision.
    const notes: MelodyEvent[] = [];
    for (const e of this.events) {
      let start = e.time;
      for (const hit of attacks) {
        if (
          hit.time <= start + 0.18 ||
          hit.time >= e.time + e.duration - 0.15 ||
          hit.strength < 0.5
        )
          continue;
        notes.push({ ...e, time: start, duration: hit.time - start });
        start = hit.time;
      }
      notes.push({ ...e, time: start, duration: e.time + e.duration - start });
    }
    const sorted = notes.map((e) => e.strength).sort((a, b) => a - b),
      top = sorted[Math.floor(sorted.length * 0.9)] || 1;
    return notes.map((e) => ({ ...e, strength: Math.min(1, e.strength / top) }));
  }
}
