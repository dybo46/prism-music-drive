import { describe, it, expect } from 'vitest';
import { analyzeSong, eventZ, roadSpeed, songFrame } from '../src/audio/song-map';
const sr = 22050;
function rhythm(bpm: number, seconds = 12) {
  const x = new Float32Array(sr * seconds);
  for (let i = 0; i < x.length; i++) {
    const t = i / sr,
      beat = (t - 0.5) % (60 / bpm);
    if (t >= 0.5 && beat < 0.15)
      x[i] = Math.sin(2 * Math.PI * 65 * beat) * 0.8 * Math.exp(-beat * 35);
  }
  return x;
}
describe('offline song map', () => {
  it.each([80, 120, 160])('detects %i BPM kicks and actual arrival times', (bpm) => {
    const x = rhythm(bpm),
      map = analyzeSong(x, x, sr);
    expect(map.bpm).toBeCloseTo(bpm, 0);
    expect(map.confidence).toBeGreaterThan(0.8);
    for (let t = 1; t < 10; t += 60 / bpm) {
      // Start from a detected event: future streetlight must reach camera exactly on its timestamp.
      const event = map.kicks.find((e) => e.time >= t)!;
      expect(eventZ(songFrame(map, event.time), event.time)).toBeCloseTo(15, 4);
      expect(eventZ(songFrame(map, event.time - 1), event.time)).toBeLessThan(-10);
    }
    expect(Math.abs(map.kicks[0].time - 0.5)).toBeLessThan(0.035);
  });
  it('does not invent a beat for silence or sustained tone', () => {
    const quiet = new Float32Array(sr * 8);
    expect(analyzeSong(quiet, quiet, sr).kicks).toHaveLength(0);
    const tone = Float32Array.from(quiet, (_, i) => Math.sin((i / sr) * 2 * Math.PI * 1000) * 0.3);
    expect(analyzeSong(tone, tone, sr).bpm).toBeNull();
  });
  it('keeps anti-phase kicks and separates quiet/loud timbre sections', () => {
    const x = rhythm(120, 16);
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      x[i] *= t < 8 ? 0.1 : 1;
      if (t >= 8) x[i] += 0.22 * Math.sin(t * 2 * Math.PI * 4500);
    }
    const map = analyzeSong(
      x,
      Float32Array.from(x, (v) => -v),
      sr,
    );
    const quiet = songFrame(map, 6),
      loud = songFrame(map, 12);
    expect(map.kicks.length).toBeGreaterThan(10);
    expect(loud.energy).toBeGreaterThan(quiet.energy * 3);
    expect(loud.brightness).toBeGreaterThan(quiet.brightness + 0.2);
    expect(map.changes.some((e) => Math.abs(e.time - 8) < 1.5)).toBe(true);
    expect(roadSpeed(160, 0.5)).toBeGreaterThan(roadSpeed(80, 0.5) * 1.4);
    expect(songFrame(map, 6).distance).toBe(quiet.distance);
  });
});
