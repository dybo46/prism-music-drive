import { expect, it } from 'vitest';
import { analyzeSong, type SongMap } from '../src/audio/song-map';
import { PALETTE, city, scoreColor, turn, finalClimax } from '../src/visualizers/score';
const sr = 22050;
function fixture(): SongMap {
  return {
    duration: 20,
    step: 0.1,
    energy: Float32Array.from({ length: 201 }, (_, i) => (i < 150 ? 0.25 : 0.9)),
    brightness: new Float32Array(201).fill(0.2),
    distance: Float32Array.from({ length: 201 }, (_, i) => i * 5),
    kicks: Array.from({ length: 40 }, (_, i) => ({ time: i * 0.5, strength: 1 })).filter(
      (e) => e.time < 7 || e.time > 11,
    ),
    highs: [],
    changes: [
      { time: 7, strength: 0.8 },
      { time: 15, strength: 1 },
    ],
    cues: [],
    signature: 123,
    bpm: 120,
    confidence: 1,
  };
}
it('uses 24 colors and six distinct colors per performance, without altering music', () => {
  const map = fixture();
  expect(new Set(PALETTE).size).toBe(24);
  expect(new Set(Array.from({ length: 6 }, (_, i) => scoreColor(map, i))).size).toBe(6);
  const alternatives = new Set(
    Array.from({ length: 100 }, (_, visualSeed) => scoreColor({ ...map, visualSeed }, 0)),
  );
  expect(alternatives.size).toBe(24);
});
it('joins turns continuously and removes 90% of city in kick-free intervals', () => {
  const map = fixture();
  for (const t of [7, 15])
    expect(Math.abs(turn(map, t - 0.0001) - turn(map, t + 0.0001))).toBeLessThan(0.001);
  expect(city(map, 9).density).toBe(0.1);
  expect(city(map, 4).density).toBe(1);
  expect(city(map, 14).color).not.toBe(city(map, 16).color);
  expect(finalClimax(map)?.time).toBe(15);
  expect(finalClimax({ ...map, energy: new Float32Array(201).fill(0.2) })).toBeUndefined();
});
it('detects sustained high tones without claiming high-frequency noise is melody', () => {
  const tone = Float32Array.from({ length: sr * 3 }, (_, i) =>
    i > sr / 2 && i < sr * 2.5 ? 0.3 * Math.sin((2 * Math.PI * 3000 * i) / sr) : 0,
  );
  const result = analyzeSong(tone, tone, sr);
  expect(result.highNotes!.length).toBeGreaterThan(0);
  expect(result.highNotes![0].frequency).toBeCloseTo(3000, -2);
  expect(result.highNotes![0].time).toBeGreaterThan(0.4);
  let seed = 123;
  const noise = Float32Array.from(tone, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed / 4294967296 - 0.5) * 0.5;
  });
  expect(analyzeSong(noise, noise, sr).highNotes).toHaveLength(0);
});
it('finds middle-band attacks and rejects a sustained middle tone after its onset', () => {
  const signal = Float32Array.from({ length: sr * 4 }, (_, i) => {
    const t = i / sr,
      p = (t - 0.5) % 1;
    return t >= 0.5 ? 0.5 * Math.sin(2 * Math.PI * 900 * t) * Math.exp(-Math.max(0, p) * 25) : 0;
  });
  const result = analyzeSong(signal, signal, sr);
  expect(result.midAttacks!.length).toBeGreaterThanOrEqual(3);
  expect(Math.abs(result.midAttacks![0].time - 0.5)).toBeLessThan(0.08);
  const tone = Float32Array.from(signal, (_, i) => 0.3 * Math.sin((2 * Math.PI * 900 * i) / sr));
  expect(
    analyzeSong(tone, tone, sr).midAttacks!.filter((e) => e.time > 0.2 && e.time < 3.8),
  ).toHaveLength(0);
});
