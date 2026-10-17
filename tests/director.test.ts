import { describe, it, expect } from 'vitest';
import { directSong } from '../src/audio/director';
import { analyzeSong } from '../src/audio/song-map';
describe('audio-conditioned scenery', () => {
  it('produces a repeatable breakdown cue only when music remains between kicks', () => {
    const kicks = Array.from({ length: 24 }, (_, i) => ({
      time: i < 12 ? i * 0.5 : 12 + (i - 12) * 0.5,
      strength: 1,
    }));
    const energy = new Float32Array(2000).fill(0.4),
      brightness = new Float32Array(2000).fill(0.3);
    const first = directSong(kicks, [], energy, brightness, 0.01, 20);
    expect(first.cues.some((c) => c.reason === 'breakdown')).toBe(true);
    expect(first).toEqual(directSong(kicks, [], energy, brightness, 0.01, 20));
    const steady = kicks.map((e, i) => ({ ...e, time: i * 0.5 }));
    expect(directSong(steady, [], energy, brightness, 0.01, 20).cues).toHaveLength(0);
    energy.fill(0, 550, 1200);
    expect(directSong(kicks, [], energy, brightness, 0.01, 20).cues).toHaveLength(0);
  });
  it('different song signatures choose varied effects, without packing every type into each track', () => {
    const kicks = Array.from({ length: 24 }, (_, i) => ({
      time: i < 12 ? i * 0.5 : 12 + (i - 12) * 0.5,
      strength: 1,
    }));
    const kinds = new Set<string>();
    for (let i = 1; i <= 20; i++) {
      const result = directSong(
        kicks,
        [],
        new Float32Array(2000).fill(0.4),
        new Float32Array(2000).fill(i / 25),
        0.01,
        20,
      );
      expect(result.cues.length).toBeLessThanOrEqual(2);
      result.cues.forEach((c) => kinds.add(c.kind));
    }
    expect(kinds.size).toBeGreaterThanOrEqual(4);
  });
  it('finds high attacks separately from bass attacks with timestamp accuracy', () => {
    const sr = 22050,
      x = new Float32Array(sr * 6);
    for (let i = 0; i < x.length; i++) {
      const t = i / sr,
        p = (t - 0.5) % 0.5;
      if (t >= 0.5) x[i] = Math.sin(p * 2 * Math.PI * 6000) * Math.exp(-p * 65) * 0.4;
    }
    const map = analyzeSong(x, x, sr);
    expect(map.highs.length).toBeGreaterThan(8);
    expect(Math.abs(map.highs[0].time - 0.5)).toBeLessThan(0.035);
    expect(map.kicks.length).toBeLessThan(3);
  });
});
